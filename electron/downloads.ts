import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import https from "https";
import { URL } from "url";

export interface DownloadJob {
  id: string;
  repoId: string;
  filename: string;
  quantization?: string;
  sizeBytes: number;
  downloaded: number;
  speed: number; // bytes/sec
  eta: number; // seconds
  status: "queued" | "downloading" | "completed" | "error" | "cancelled";
  error?: string;
  startedAt: number;
  finishedAt?: number;
  destination: string;
}

class DownloadManager extends EventEmitter {
  private jobs = new Map<string, DownloadJob>();
  private controllers = new Map<string, { abort: () => void }>();

  list(): DownloadJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  async start(
    payload: { repoId: string; filename: string; quantization?: string; sizeBytes?: number },
    modelsDir: string,
    logsDir: string,
    hfToken?: string
  ): Promise<DownloadJob> {
    if (!/^[\w.-]+\/[\w.-]+$/.test(payload.repoId)) {
      throw new Error(`Invalid Hugging Face repository: ${payload.repoId}`);
    }
    const filenameParts = payload.filename.replace(/\\/g, "/").split("/");
    if (
      filenameParts.length === 0 ||
      filenameParts.some((part) => !part || part === "." || part === "..") ||
      path.isAbsolute(payload.filename)
    ) {
      throw new Error(`Invalid model filename: ${payload.filename}`);
    }

    const id = `${payload.repoId.replace("/", "_")}__${payload.filename}`;
    const safeRepo = payload.repoId.replace("/", "__");
    const subdir = path.join(modelsDir, safeRepo);
    fs.mkdirSync(subdir, { recursive: true });
    const dest = path.resolve(subdir, ...filenameParts);
    const subdirPrefix = path.resolve(subdir) + path.sep;
    if (!dest.startsWith(subdirPrefix)) throw new Error("Download path escapes the model directory");
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    const job: DownloadJob = {
      id,
      repoId: payload.repoId,
      filename: payload.filename,
      quantization: payload.quantization,
      sizeBytes: payload.sizeBytes ?? 0,
      downloaded: 0,
      speed: 0,
      eta: 0,
      status: "queued",
      startedAt: Date.now(),
      destination: dest,
    };
    this.jobs.set(id, job);

    if (fs.existsSync(dest)) {
      const existingSize = fs.statSync(dest).size;
      job.sizeBytes = existingSize;
      job.downloaded = existingSize;
      job.status = "completed";
      job.finishedAt = Date.now();
      queueMicrotask(() => this.emit("complete", { ...job }));
      return job;
    }

    // Start in background
    this.runJob(job, dest, hfToken).catch((e) => {
      if (job.status === "cancelled") return;
      job.status = "error";
      job.error = String(e?.message ?? e);
      job.finishedAt = Date.now();
      this.emit("complete", job);
    });
    return job;
  }

  private async runJob(job: DownloadJob, dest: string, hfToken?: string) {
    job.status = "downloading";
    this.emit("progress", { ...job });

    const safePath = job.filename
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    const url = `https://huggingface.co/${job.repoId}/resolve/main/${safePath.replace(/^\//, "")}`;
    const tmp = dest + ".part";

    return new Promise<void>((resolve, reject) => {
      const headers: Record<string, string> = {
        "User-Agent": "LocalIdeaStudio/0.1.4",
      };
      if (hfToken?.trim()) headers.Authorization = `Bearer ${hfToken.trim()}`;

      // Resume support: HTTP Range if .part exists
      if (fs.existsSync(tmp)) {
        const partialSize = fs.statSync(tmp).size;
        if (partialSize > 0) headers["Range"] = `bytes=${partialSize}-`;
      }

      let activeRequest: ReturnType<typeof https.get> | null = null;
      let activeResponse: any = null;
      let activeStream: fs.WriteStream | null = null;
      let aborted = false;

      const fail = (error: Error) => {
        this.controllers.delete(job.id);
        reject(error);
      };
      const done = () => {
        this.controllers.delete(job.id);
        resolve();
      };

      const request = (target: string, redirectsLeft: number) => {
        if (aborted) return fail(new Error("Download cancelled"));
        const u = new URL(target);
        activeRequest = https.get(
          { host: u.host, path: u.pathname + u.search, headers },
          (res) => {
            activeResponse = res;
            if (
              res.statusCode &&
              [301, 302, 303, 307, 308].includes(res.statusCode) &&
              res.headers.location
            ) {
              res.resume();
              if (redirectsLeft <= 0) return fail(new Error("Too many download redirects"));
              return request(new URL(res.headers.location, target).toString(), redirectsLeft - 1);
            }
            if (res.statusCode === 416 && fs.existsSync(tmp)) {
              const partialSize = fs.statSync(tmp).size;
              if (job.sizeBytes > 0 && partialSize === job.sizeBytes) {
                fs.renameSync(tmp, dest);
                job.status = "completed";
                job.downloaded = partialSize;
                job.finishedAt = Date.now();
                this.emit("complete", { ...job });
                return done();
              }
            }
            if (res.statusCode && res.statusCode >= 400) {
              res.resume();
              return fail(new Error(`Hugging Face download HTTP ${res.statusCode}`));
            }

            const partialSize = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
            const resumeAccepted = res.statusCode === 206 && partialSize > 0;
            const startOffset = resumeAccepted ? partialSize : 0;
            if (!resumeAccepted) delete headers.Range;
            activeStream = this.handleResponse(
              res,
              job,
              dest,
              tmp,
              startOffset,
              done,
              fail
            );
          }
        );
        activeRequest.on("error", fail);
      };

      this.controllers.set(job.id, {
        abort: () => {
          aborted = true;
          try { activeResponse?.destroy(new Error("Download cancelled")); } catch {}
          try { activeRequest?.destroy(new Error("Download cancelled")); } catch {}
          try { activeStream?.destroy(new Error("Download cancelled")); } catch {}
        },
      });
      request(url, 8);
    });
  }

  private handleResponse(
    res: any,
    job: DownloadJob,
    dest: string,
    tmp: string,
    startOffset: number,
    resolve: () => void,
    reject: (e: Error) => void
  ): fs.WriteStream {
    const contentRange = String(res.headers?.["content-range"] ?? "");
    const rangeTotal = Number(contentRange.match(/\/(\d+)$/)?.[1] ?? 0);
    const contentLength = parseInt(res.headers?.["content-length"] || "0", 10);
    const reportedTotal = rangeTotal || (contentLength > 0 ? contentLength + startOffset : 0);
    const total = reportedTotal || job.sizeBytes;
    if (total > 0) job.sizeBytes = total;

    const fileStream = fs.createWriteStream(tmp, { flags: startOffset > 0 ? "a" : "w" });
    let downloaded = startOffset;
    let _lastTime = Date.now();
    let _lastBytes = startOffset;

    res.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      const now = Date.now();
      const dt = (now - _lastTime) / 1000;
      if (dt >= 0.5) {
        const speed = (downloaded - _lastBytes) / dt;
        job.speed = speed;
        job.downloaded = downloaded;
        job.sizeBytes = total;
        job.eta = speed > 0 && total > 0 ? Math.max(0, (total - downloaded) / speed) : 0;
        _lastTime = now;
        _lastBytes = downloaded;
        this.emit("progress", { ...job });
      }
    });

    res.pipe(fileStream);
    fileStream.on("finish", () => {
      fileStream.close(() => {
        try {
          fs.renameSync(tmp, dest);
        } catch (e) {
          reject(e as Error);
          return;
        }
        job.status = "completed";
        job.downloaded = downloaded;
        if (job.sizeBytes <= 0) job.sizeBytes = downloaded;
        job.finishedAt = Date.now();
        job.eta = 0;
        this.emit("progress", { ...job });
        this.emit("complete", { ...job });
        resolve();
      });
    });
    fileStream.on("error", (e) => reject(e));
    res.on("error", (e: Error) => reject(e));
    return fileStream;
  }

  cancel(id: string) {
    const ctl = this.controllers.get(id);
    if (ctl) ctl.abort();
    const job = this.jobs.get(id);
    if (job) {
      job.status = "cancelled";
      job.finishedAt = Date.now();
      job.speed = 0;
      job.eta = 0;
      this.emit("complete", { ...job });
    }
    return true;
  }
}

export const downloadManager = new DownloadManager();

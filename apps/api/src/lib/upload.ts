// apps/api/src/lib/upload.ts
import multer from "multer";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const uploadDir = join(process.cwd(), "uploads");
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = file.originalname.split(".").pop();
      // ✅ neutral name (not "avatar-")
      cb(null, `upload-${unique}.${ext || "bin"}`);
    },
  }),
  // ✅ increase limit for videos (e.g. 100MB)
  limits: { fileSize: 100 * 1024 * 1024 },
});

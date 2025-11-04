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
      cb(null, `avatar-${unique}.${ext || "bin"}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

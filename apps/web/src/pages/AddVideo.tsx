// apps/web/src/pages/AddVideo.tsx
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPost } from "../api";
import "../styles/pages/add-post.css";

export default function AddVideo() {
  const navigate = useNavigate();

  const [caption, setCaption] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Хэштеги из подписи
  const hashtags = useMemo(() => {
    const matches = caption.match(/#[^\s#]+/g);
    return matches ?? [];
  }, [caption]);

  // Превью медиа
  useEffect(() => {
    if (!mediaFile) {
      setMediaPreview(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setMediaPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [mediaFile]);

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setMediaFile(null);
      return;
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Поддерживаются только изображения и видео");
      setMediaFile(null);
      return;
    }

    setError(null);
    setMediaFile(file);
  };

  const handleMediaCardClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const trimmed = caption.trim();

    // Разрешаем пост: текст ИЛИ медиа (или вместе)
    if (!trimmed && !mediaFile) {
      setError("Добавь текст или прикрепи фото/видео к посту 🙂");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await createPost(trimmed, mediaFile);
      navigate("/feed");
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        "Не удалось создать пост. Попробуй ещё раз.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="su-main">
      <div className="container add-post-container">
        <h1 className="page-title add-post-title">Add post</h1>

        <form onSubmit={handleSubmit} className="add-post-form">
          {/* Блок выбора медиа */}
          <div className="add-post-media-section">
            <span className="add-post-label-text">Медиа (фото или видео):</span>

            {/* Скрытый инпут, кликаем по карточке */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="add-post-media-input-hidden"
            />

            <div
              className={`add-post-media-card ${
                mediaPreview
                  ? "add-post-media-card--filled"
                  : "add-post-media-card--empty"
              }`}
              onClick={handleMediaCardClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleMediaCardClick();
                }
              }}
            >
              {!mediaPreview && (
                <div className="add-post-media-placeholder">
                  <div className="add-post-media-plus">+</div>
                  <div className="add-post-media-text">
                    Tap to add photo / video
                  </div>
                  <div className="add-post-media-hint">
                    Поддерживаются изображения и короткие ролики
                  </div>
                </div>
              )}

              {mediaPreview && mediaFile && (
                <div className="add-post-media-preview">
                  {mediaFile.type.startsWith("image/") ? (
                    <img
                      src={mediaPreview}
                      alt="Preview"
                      className="add-post-media-preview-image"
                    />
                  ) : (
                    <video
                      src={mediaPreview}
                      controls
                      className="add-post-media-preview-video"
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Подпись под медиа */}
          <label className="add-post-label">
            <span className="add-post-label-text">Подпись / описание:</span>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Добавь подпись, отметь стиль и хэштеги..."
              className="add-post-textarea"
            />
          </label>

          {hashtags.length > 0 && (
            <div className="add-post-hashtags">
              <div className="add-post-hashtags-title">
                Хэштеги, найденные в тексте:
              </div>
              <div className="add-post-hashtags-list">
                {hashtags.map((tag) => (
                  <span key={tag} className="add-post-hashtag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && <div className="auth-error add-post-error">{error}</div>}

          <button
            type="submit"
            className="su-btn su-btn--accent add-post-submit"
            disabled={loading}
          >
            {loading ? "Публикуем..." : "Publish post"}
          </button>
        </form>
      </div>
    </main>
  );
}

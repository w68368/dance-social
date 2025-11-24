// apps/web/src/pages/AddVideo.tsx
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPost } from "../api";
import "../styles/pages/add-post.css";

const MAX_FILE_MB = 100; // держим в уме серверный лимит

const STEP_LABELS = ["Медиа", "Подпись", "Предпросмотр"];

export default function AddVideo() {
  const navigate = useNavigate();

  const [caption, setCaption] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // wizard
  const [currentStep, setCurrentStep] = useState<number>(1);

  // drag&drop highlight
  const [isDragOver, setIsDragOver] = useState(false);

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

  // универсальный обработчик выбранного файла (и из input, и из drop)
  const handleFileSelect = (file: File | null) => {
    if (!file) {
      setMediaFile(null);
      return;
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Поддерживаются только изображения и видео");
      setMediaFile(null);
      return;
    }

    const maxBytes = MAX_FILE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`Файл слишком большой. Максимум ${MAX_FILE_MB}MB.`);
      setMediaFile(null);
      return;
    }

    setError(null);
    setMediaFile(file);
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] ?? null;
    handleFileSelect(file);
  };

  const handleMediaCardClick = () => {
    fileInputRef.current?.click();
  };

  // drag & drop
  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // чтобы не мигало при уходе внутрь потомка — проверяем relatedTarget
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // навигация по шагам
  const totalSteps = STEP_LABELS.length;

  const goToStep = (step: number) => {
    if (step < 1 || step > totalSteps) return;
    setCurrentStep(step);
  };

  const nextStep = () => {
    setCurrentStep((prev) => Math.min(totalSteps, prev + 1));
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const progressWidth =
    totalSteps <= 1 ? "0%" : `${((currentStep - 1) / (totalSteps - 1)) * 100}%`;

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const trimmed = caption.trim();

    // Разрешаем пост: текст ИЛИ медиа (или вместе)
    if (!trimmed && !mediaFile) {
      setError("Добавь текст или прикрепи фото/видео к посту 🙂");
      // если человек пытается публиковать с последнего шага — вернём его на шаг с полями
      if (currentStep !== 1) {
        setCurrentStep(1);
      }
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

  const isPhoto = mediaFile && mediaFile.type.startsWith("image/");
  const isVideo = mediaFile && mediaFile.type.startsWith("video/");

  const canGoNextFromMedia = !!mediaFile || caption.trim().length > 0; // можно без медиа, если уже есть текст

  return (
    <main className="su-main">
      <div className="container add-post-container">
        <h1 className="page-title add-post-title">Add post</h1>
        <p className="add-post-subtitle">
          Создай стильный пост шаг за шагом: выбери медиа, добавь подпись и
          проверь всё в предпросмотре.
        </p>

        <form onSubmit={handleSubmit} className="add-post-form">
          {/* WIZARD STEPS + PROGRESS */}
          <div className="post-wizard">
            <div className="post-wizard-steps">
              {STEP_LABELS.map((label, idx) => {
                const stepNumber = idx + 1;
                const isActive = stepNumber === currentStep;
                const isDone = stepNumber < currentStep;
                return (
                  <button
                    key={label}
                    type="button"
                    className={`post-wizard-step ${isActive ? "active" : ""} ${
                      isDone ? "done" : ""
                    }`}
                    onClick={() => goToStep(stepNumber)}
                  >
                    <span className="dot" />
                    <span className="label">
                      {stepNumber}. {label}
                    </span>
                  </button>
                );
              })}
              <div
                className="post-wizard-progress"
                style={{ width: progressWidth }}
              />
            </div>

            <div className="post-wizard-content">
              {/* ===== ШАГ 1: МЕДИА ===== */}
              {currentStep === 1 && (
                <section className="step-card">
                  <h2 className="step-title">Шаг 1. Медиа</h2>
                  <p className="step-subtitle">
                    Загрузить фото или видео можно кликом по карточке или
                    перетащив файл. Поддерживаются изображения и короткие
                    ролики.
                  </p>

                  <div className="add-post-media-section">
                    <span className="add-post-label-text">
                      Медиа (фото или видео):
                    </span>

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
                      } ${isDragOver ? "add-post-media-card--drag-over" : ""}`}
                      onClick={handleMediaCardClick}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleMediaCardClick();
                        }
                      }}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      {!mediaPreview && (
                        <div className="add-post-media-placeholder">
                          <div className="add-post-media-plus">+</div>
                          <div className="add-post-media-text">
                            Tap or drop to add photo / video
                          </div>
                          <div className="add-post-media-hint">
                            JPG, PNG, MP4, MOV · до {MAX_FILE_MB}MB
                          </div>
                        </div>
                      )}

                      {mediaPreview && mediaFile && (
                        <div className="add-post-media-preview">
                          {isPhoto ? (
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

                    {/* инфо о выбранном файле + действия */}
                    {mediaFile && (
                      <div className="add-post-media-meta-row">
                        <div className="add-post-media-meta-main">
                          <span className="add-post-media-pill">
                            {isPhoto ? "Фото" : isVideo ? "Видео" : "Медиа"}
                          </span>
                          <span className="add-post-media-filename">
                            {mediaFile.name}
                          </span>
                          <span className="add-post-media-size">
                            {(mediaFile.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>
                        <div className="add-post-media-meta-actions">
                          <button
                            type="button"
                            className="add-post-media-change-btn"
                            onClick={handleMediaCardClick}
                          >
                            Заменить
                          </button>
                          <button
                            type="button"
                            className="add-post-media-remove-btn"
                            onClick={clearMedia}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    )}

                    {!mediaFile && (
                      <div className="add-post-media-tip">
                        Можно создать и текстовый пост — медиа не обязательно,
                        но яркое фото/видео повышает вовлечённость ✨
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ===== ШАГ 2: ПОДПИСЬ / ХЭШТЕГИ ===== */}
              {currentStep === 2 && (
                <section className="step-card">
                  <h2 className="step-title">Шаг 2. Подпись</h2>
                  <p className="step-subtitle">
                    Опиши танец, отметь стиль, добавь хэштеги и можешь упомянуть
                    друзей через @username.
                  </p>

                  <label className="add-post-label">
                    <span className="add-post-label-text">
                      Подпись / описание:
                    </span>
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
                </section>
              )}

              {/* ===== ШАГ 3: ПРЕДПРОСМОТР ===== */}
              {currentStep === 3 && (
                <section className="step-card">
                  <h2 className="step-title">Шаг 3. Предпросмотр</h2>
                  <p className="step-subtitle">
                    Так пост будет выглядеть в ленте. Проверь подпись и медиа
                    перед публикацией.
                  </p>

                  <div className="preview-card">
                    {mediaPreview && mediaFile && (
                      <div className="add-post-media-preview add-post-media-preview--compact">
                        {isPhoto ? (
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

                    {caption && (
                      <div className="preview-caption">{caption}</div>
                    )}

                    {hashtags.length > 0 && (
                      <div className="preview-hashtags add-post-hashtags-list">
                        {hashtags.map((tag) => (
                          <span key={tag} className="add-post-hashtag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {!mediaFile && !caption.trim() && (
                      <div className="add-post-media-tip">
                        Пока пусто 😅 Добавь медиа или подпись, чтобы
                        опубликовать пост.
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Ошибка под контентом */}
            {error && (
              <div
                className="auth-error add-post-error"
                style={{ marginTop: 4 }}
              >
                {error}
              </div>
            )}

            {/* Навигация по шагам / Публикация */}
            <div className="step-actions">
              <button
                type="button"
                className="su-btn su-btn--ghost"
                onClick={prevStep}
                disabled={currentStep === 1}
              >
                Назад
              </button>

              {currentStep < totalSteps ? (
                <button
                  type="button"
                  className="su-btn su-btn--accent"
                  onClick={nextStep}
                  disabled={currentStep === 1 && !canGoNextFromMedia}
                >
                  Далее
                </button>
              ) : (
                <button
                  type="submit"
                  className="su-btn su-btn--accent add-post-submit"
                  disabled={loading}
                >
                  {loading ? "Публикуем..." : "Publish post"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

// apps/web/src/pages/AddVideo.tsx
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createPost,
  searchUsers,
  searchHashtags,
  type ApiUserSummary,
  type HashtagDto,
} from "../api";
import "../styles/pages/add-post.css";

const MAX_FILE_MB = 100;
const CAPTION_MAX_LENGTH = 1000;
const CAPTION_SOFT_WARNING = 500;

const STEP_LABELS = ["Media", "Caption", "Preview"];

export default function AddVideo() {
  const navigate = useNavigate();

  const [caption, setCaption] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const captionLength = caption.length;
  const isCaptionTooLong = captionLength > CAPTION_MAX_LENGTH;
  const isCaptionLongButOk =
    captionLength > CAPTION_SOFT_WARNING && !isCaptionTooLong;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // wizard
  const [currentStep, setCurrentStep] = useState<number>(1);

  // drag&drop highlight
  const [isDragOver, setIsDragOver] = useState(false);

  // state for @mentions
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<ApiUserSummary[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const mentionSearchTimeoutRef = useRef<number | null>(null);

  // state for #hashtags
  const [hashtagQuery, setHashtagQuery] = useState("");
  const [hashtagResults, setHashtagResults] = useState<HashtagDto[]>([]);
  const [showHashtagDropdown, setShowHashtagDropdown] = useState(false);
  const hashtagSearchTimeoutRef = useRef<number | null>(null);

  // Hashtags already present in the caption (for the block under textarea)
  const hashtags = useMemo(() => {
    const matches = caption.match(/#[^\s#]+/g);
    return matches ?? [];
  }, [caption]);

  // Media preview
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

  // Debounced user search for @mentions
  useEffect(() => {
    if (mentionSearchTimeoutRef.current !== null) {
      window.clearTimeout(mentionSearchTimeoutRef.current);
    }

    if (!mentionQuery || mentionQuery.length < 2) {
      setMentionResults([]);
      return;
    }

    mentionSearchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const users = await searchUsers(mentionQuery);
        setMentionResults(users);
      } catch (e) {
        console.error("searchUsers error", e);
        setMentionResults([]);
      }
    }, 300);

    return () => {
      if (mentionSearchTimeoutRef.current !== null) {
        window.clearTimeout(mentionSearchTimeoutRef.current);
      }
    };
  }, [mentionQuery]);

  // Debounced hashtag search
  useEffect(() => {
    if (hashtagSearchTimeoutRef.current !== null) {
      window.clearTimeout(hashtagSearchTimeoutRef.current);
    }

    if (!hashtagQuery || hashtagQuery.length < 2) {
      setHashtagResults([]);
      return;
    }

    hashtagSearchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const tags = await searchHashtags(hashtagQuery);
        setHashtagResults(tags);
      } catch (e) {
        console.error("searchHashtags error", e);
        setHashtagResults([]);
      }
    }, 300);

    return () => {
      if (hashtagSearchTimeoutRef.current !== null) {
        window.clearTimeout(hashtagSearchTimeoutRef.current);
      }
    };
  }, [hashtagQuery]);

  // -----------------------------
  // File
  // -----------------------------
  const handleFileSelect = (file: File | null) => {
    if (!file) {
      setMediaFile(null);
      return;
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Only images and videos are supported");
      setMediaFile(null);
      return;
    }

    const maxBytes = MAX_FILE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File is too large. Maximum ${MAX_FILE_MB} MB.`);
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

  // -----------------------------
  // Wizard step navigation
  // -----------------------------
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

  // -----------------------------
  // Detection of @ and # at cursor
  // -----------------------------
  const detectMentionAtCursor = (value: string) => {
    if (!textareaRef.current) {
      setShowMentionDropdown(false);
      setMentionQuery("");
      return;
    }

    const el = textareaRef.current;
    const cursorPos = el.selectionEnd ?? value.length;

    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(^|\s)@([\w.]{1,20})$/);

    if (match) {
      const query = match[2];
      setMentionQuery(query);
      setShowMentionDropdown(true);
    } else {
      setMentionQuery("");
      setShowMentionDropdown(false);
    }
  };

  const detectHashtagAtCursor = (value: string) => {
    if (!textareaRef.current) {
      setShowHashtagDropdown(false);
      setHashtagQuery("");
      return;
    }

    const el = textareaRef.current;
    const cursorPos = el.selectionEnd ?? value.length;

    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(^|\s)#([^\s#]{1,30})$/);

    if (match) {
      const query = match[2];
      setHashtagQuery(query);
      setShowHashtagDropdown(true);
    } else {
      setHashtagQuery("");
      setShowHashtagDropdown(false);
    }
  };

  const handleCaptionChange: React.ChangeEventHandler<HTMLTextAreaElement> = (
    e
  ) => {
    const value = e.target.value;
    setCaption(value);
    detectMentionAtCursor(value);
    detectHashtagAtCursor(value);
  };

  const handleMentionSelect = (user: ApiUserSummary) => {
    if (!textareaRef.current) return;

    const el = textareaRef.current;
    const cursorPos = el.selectionEnd ?? caption.length;
    const textBeforeCursor = caption.slice(0, cursorPos);
    const textAfterCursor = caption.slice(cursorPos);

    const match = textBeforeCursor.match(/(^|\s)@([\w.]{0,20})$/);
    if (!match || match.index === undefined) {
      return;
    }

    const prefix = textBeforeCursor.slice(0, match.index);
    const spaceOrStart = match[1];

    const mentionText = "@" + user.username;
    const newBefore = prefix + spaceOrStart + mentionText + " ";
    const newCaption = newBefore + textAfterCursor;

    setCaption(newCaption);
    setShowMentionDropdown(false);
    setMentionQuery("");
    setMentionResults([]);

    requestAnimationFrame(() => {
      const pos = newBefore.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleHashtagSelect = (tag: HashtagDto) => {
    if (!textareaRef.current) return;

    const el = textareaRef.current;
    const cursorPos = el.selectionEnd ?? caption.length;
    const textBeforeCursor = caption.slice(0, cursorPos);
    const textAfterCursor = caption.slice(cursorPos);

    const match = textBeforeCursor.match(/(^|\s)#([^\s#]{0,30})$/);
    if (!match || match.index === undefined) {
      return;
    }

    const prefix = textBeforeCursor.slice(0, match.index);
    const spaceOrStart = match[1];

    const hashtagText = "#" + tag.tag;
    const newBefore = prefix + spaceOrStart + hashtagText + " ";
    const newCaption = newBefore + textAfterCursor;

    setCaption(newCaption);
    setShowHashtagDropdown(false);
    setHashtagQuery("");
    setHashtagResults([]);

    requestAnimationFrame(() => {
      const pos = newBefore.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  // -----------------------------
  // Submit
  // -----------------------------
  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const trimmed = caption.trim();

    if (!trimmed && !mediaFile) {
      setError("Add some text or attach a photo / video to your post 🙂");
      if (currentStep !== 1) {
        setCurrentStep(1);
      }
      return;
    }

    if (captionLength > CAPTION_MAX_LENGTH) {
      setError(
        `Caption is longer than ${CAPTION_MAX_LENGTH} characters. Please shorten the text.`
      );
      if (currentStep !== 2) {
        setCurrentStep(2);
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
        "Failed to create post. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isPhoto = mediaFile && mediaFile.type.startsWith("image/");
  const isVideo = mediaFile && mediaFile.type.startsWith("video/");

  const canGoNextFromMedia = !!mediaFile || caption.trim().length > 0;

  return (
    <main className="su-main">
      <div className="container add-post-container">
        <h1 className="page-title add-post-title">Add post</h1>
        <p className="add-post-subtitle">
          Create a stylish post step by step: pick media, add a caption, and
          check everything in the preview.
        </p>

        <form onSubmit={handleSubmit} className="add-post-form">
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
              {/* ===== STEP 1 ===== */}
              {currentStep === 1 && (
                <section className="step-card">
                  <h2 className="step-title">Step 1. Media</h2>
                  <p className="step-subtitle">
                    Upload a photo or video by clicking the card or dragging a file.
                    Images and short videos are supported.
                  </p>

                  <div className="add-post-media-section">
                    <span className="add-post-label-text">
                      Media (photo or video):
                    </span>

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
                            JPG, PNG, MP4, MOV · up to {MAX_FILE_MB} MB
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

                    {mediaFile && (
                      <div className="add-post-media-meta-row">
                        <div className="add-post-media-meta-main">
                          <span className="add-post-media-pill">
                            {isPhoto ? "Photo" : isVideo ? "Video" : "Media"}
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
                            Replace
                          </button>
                          <button
                            type="button"
                            className="add-post-media-remove-btn"
                            onClick={clearMedia}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}

                    {!mediaFile && (
                      <div className="add-post-media-tip">
                        You can also create a text-only post — media is optional,
                        but a bright photo/video boosts engagement ✨
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ===== STEP 2 ===== */}
              {currentStep === 2 && (
                <section className="step-card">
                  <h2 className="step-title">Step 2. Caption</h2>
                  <p className="step-subtitle">
                    Describe the dance, mention the style, add hashtags, and tag
                    friends using @username.
                  </p>

                  <label className="add-post-label add-post-label--with-mentions">
                    <span className="add-post-label-text">
                      Caption / description:
                    </span>
                    <div className="add-post-textarea-wrapper">
                      <textarea
                        ref={textareaRef}
                        value={caption}
                        onChange={handleCaptionChange}
                        rows={4}
                        placeholder="Add a caption, mention style, hashtags and friends via @username..."
                        className="add-post-textarea"
                        onBlur={() => {
                          // small delay so you can click dropdown items
                          setTimeout(() => {
                            setShowMentionDropdown(false);
                            setShowHashtagDropdown(false);
                          }, 150);
                        }}
                        onFocus={() => {
                          if (mentionQuery) setShowMentionDropdown(true);
                          if (hashtagQuery) setShowHashtagDropdown(true);
                        }}
                      />

                      {/* mentions dropdown */}
                      {showMentionDropdown && mentionResults.length > 0 && (
                        <div className="mention-dropdown">
                          {mentionResults.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              className="mention-dropdown-item"
                              onClick={() => handleMentionSelect(user)}
                            >
                              {user.avatarUrl && (
                                <img
                                  src={user.avatarUrl}
                                  alt={user.username}
                                  className="mention-avatar"
                                />
                              )}
                              <div className="mention-text">
                                <div className="mention-username">
                                  @{user.username}
                                </div>
                                {user.displayName && (
                                  <div className="mention-display-name">
                                    {user.displayName}
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* hashtags dropdown */}
                      {showHashtagDropdown && hashtagResults.length > 0 && (
                        <div className="mention-dropdown">
                          {hashtagResults.map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              className="mention-dropdown-item"
                              onClick={() => handleHashtagSelect(tag)}
                            >
                              <div className="mention-text">
                                <div className="mention-username">
                                  #{tag.tag}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>

                  <div className="add-post-caption-meta">
                    <span
                      className={
                        "add-post-char-counter" +
                        (isCaptionTooLong
                          ? " add-post-char-counter--too-long"
                          : "")
                      }
                    >
                      {captionLength} / {CAPTION_MAX_LENGTH}
                    </span>

                    {isCaptionTooLong && (
                      <span className="add-post-char-error">
                        The text exceeds the allowed length — please shorten the
                        caption.
                      </span>
                    )}

                    {!isCaptionTooLong && isCaptionLongButOk && (
                      <span className="add-post-char-warning">
                        The caption is quite long — consider splitting it into
                        paragraphs 😊
                      </span>
                    )}
                  </div>

                  {hashtags.length > 0 && (
                    <div className="add-post-hashtags">
                      <div className="add-post-hashtags-title">
                        Hashtags detected in text:
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

              {/* ===== STEP 3 ===== */}
              {currentStep === 3 && (
                <section className="step-card">
                  <h2 className="step-title">Step 3. Preview</h2>
                  <p className="step-subtitle">
                    This is how your post will look in the feed. Check the
                    caption and media before publishing.
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
                        It’s empty for now. Add media or a caption to publish
                        your post.
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Error under content */}
            {error && (
              <div
                className="auth-error add-post-error"
                style={{ marginTop: 4 }}
              >
                {error}
              </div>
            )}

            {/* Step navigation / Publish */}
            <div className="step-actions">
              <button
                type="button"
                className="su-btn su-btn--ghost"
                onClick={prevStep}
                disabled={currentStep === 1}
              >
                Back
              </button>

              {currentStep < totalSteps ? (
                <button
                  type="button"
                  className="su-btn su-btn--accent"
                  onClick={nextStep}
                  disabled={currentStep === 1 && !canGoNextFromMedia}
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  className="su-btn su-btn--accent add-post-submit"
                  disabled={loading}
                >
                  {loading ? "Publishing..." : "Publish post"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

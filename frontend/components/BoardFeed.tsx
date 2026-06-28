"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ── Relative time helper ── */
function _relativeTime(ts?: number): string {
  if (!ts) return "";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return "방금 전";
  if (diff < 60) return `${diff}초 전`;
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  return `${hr}시간 전`;
}
import { Post } from "@/mock_data/posts";
import { GameEvent } from "@/mock_data/events";
import { Agent } from "@/mock_data/agents";
import {
  Heart,
  ThumbsDown,
  MessageCircle,
  MoreHorizontal,
  Send,
  AtSign,
  X,
  Newspaper,
} from "lucide-react";
import { AGENT_ICONS } from "@/lib/agentIcons";
import { getProfileImg } from "@/lib/profileImg";

interface BoardComposeInput {
  text: string;
  target_thread_id?: string;
  mention_agent_id?: string;
}
interface BoardVoteInput {
  post_id: string;
  comment_id?: string;
  dir: "like" | "dislike";
}

export default function BoardFeed({
  posts,
  events = [],
  agents = [],
  snsAgents = [],
  emotionDeltas = {},
  currentRound,
  onPost,
  onVote,
}: {
  posts: Post[];
  events?: GameEvent[];
  agents?: Agent[];
  snsAgents?: Agent[];
  emotionDeltas?: Record<string, Record<string, number>>;
  /** Highest round in play — used to collapse earlier rounds. */
  currentRound?: number;
  onPost?: (input: BoardComposeInput) => void;
  onVote?: (input: BoardVoteInput) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // post id -> comment count last seen by the user (for the "new comment" 느낌표).
  const [seen, setSeen] = useState<Record<string, number>>({});
  // Track when each post/comment first appeared (real wall-clock time)
  const firstSeenRef = useRef<Map<string, number>>(new Map());
  // Tick every 30s so relative times refresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);
  // ids whose like/comment counter just increased -> brief bump animation.
  const [bumpedLike, setBumpedLike] = useState<Set<string>>(new Set());
  const [bumpedComment, setBumpedComment] = useState<Set<string>>(new Set());
  const prevCounts = useRef<Record<string, { likes: number; comments: number }>>({});

  // Record real wall-clock time when posts/comments first appear
  useEffect(() => {
    const now = Date.now();
    for (const p of posts) {
      if (!firstSeenRef.current.has(p.id)) firstSeenRef.current.set(p.id, now);
      for (const c of p.comments) {
        if (c.id && !firstSeenRef.current.has(c.id)) firstSeenRef.current.set(c.id, now);
      }
    }
  }, [posts]);

  // Baseline each post's comment count the first time we see it, so old comments
  // don't all flash the 느낌표; only later increases flag as "new".
  useEffect(() => {
    setSeen((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of posts) {
        if (!(p.id in next)) {
          next[p.id] = p.comments.length;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [posts]);

  // Detect like/comment increases (from polling OR our own action) → animate.
  useEffect(() => {
    const grewLike = new Set<string>();
    const grewComment = new Set<string>();
    for (const p of posts) {
      const prev = prevCounts.current[p.id];
      if (prev) {
        if (p.likes > prev.likes) grewLike.add(p.id);
        if (p.comments.length > prev.comments) grewComment.add(p.id);
      }
      prevCounts.current[p.id] = { likes: p.likes, comments: p.comments.length };
    }
    if (grewLike.size) {
      setBumpedLike((s) => {
        const n = new Set(s);
        grewLike.forEach((x) => n.add(x));
        return n;
      });
      setTimeout(() => setBumpedLike(new Set()), 600);
    }
    if (grewComment.size) {
      setBumpedComment((s) => {
        const n = new Set(s);
        grewComment.forEach((x) => n.add(x));
        return n;
      });
      setTimeout(() => setBumpedComment(new Set()), 600);
    }
  }, [posts]);

  // events arrive newest-first (the backend prepends each round), so the
  // current round's event is index 0 and the prior ones follow it.
  const latestEvent = events.length > 0 ? events[0] : null;
  const priorEvents = events.length > 1 ? events.slice(1, 4) : [];

  const toggleExpand = (id: string, commentCount: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // opening clears the new-comment 느낌표
    setSeen((s) => ({ ...s, [id]: commentCount }));
  };

  const hasNewComments = (p: Post) => p.comments.length > (seen[p.id] ?? p.comments.length);

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-pixel-table border-b-2 border-black">
        <h3 className="text-[17px] font-extrabold text-black tracking-tight">투자 게시판</h3>
      </div>

      <FeedTab
        posts={posts}
        latestEvent={latestEvent}
        priorEvents={priorEvents}
        expanded={expanded}
        toggleExpand={toggleExpand}
        hasNewComments={hasNewComments}
        bumpedLike={bumpedLike}
        bumpedComment={bumpedComment}
        agents={agents}
        snsAgents={snsAgents}
        onVote={onVote}
        onPost={onPost}
        firstSeen={firstSeenRef.current}
      />
    </div>
  );
}

/* ── Feed tab ── */
function FeedTab({
  posts,
  latestEvent,
  priorEvents,
  expanded,
  toggleExpand,
  hasNewComments,
  bumpedLike,
  bumpedComment,
  agents,
  snsAgents,
  onVote,
  onPost,
  firstSeen,
}: {
  posts: Post[];
  latestEvent: GameEvent | null;
  priorEvents: GameEvent[];
  expanded: Set<string>;
  toggleExpand: (id: string, n: number) => void;
  hasNewComments: (p: Post) => boolean;
  bumpedLike: Set<string>;
  bumpedComment: Set<string>;
  agents: Agent[];
  snsAgents: Agent[];
  onVote?: (input: BoardVoteInput) => void;
  onPost?: (input: BoardComposeInput) => void;
  firstSeen?: Map<string, number>;
}) {
  const mentionList = useMemo(() => [...agents, ...snsAgents], [agents, snsAgents]);

  // All posts, newest first
  const sorted = useMemo(() => [...posts].reverse(), [posts]);

  const renderCard = (post: Post) => (
    <PostCard
      key={post.id}
      post={post}
      expanded={expanded.has(post.id)}
      toggleExpand={toggleExpand}
      newComments={hasNewComments(post)}
      bumpLike={bumpedLike.has(post.id)}
      bumpComment={bumpedComment.has(post.id)}
      mentionList={mentionList}
      onVote={onVote}
      onPost={onPost}
      firstSeen={firstSeen}
    />
  );

  const feedRef = useRef<HTMLDivElement>(null);
  const prevPostLen = useRef(sorted.length);

  // Auto-scroll to top when new posts arrive
  useEffect(() => {
    if (sorted.length > prevPostLen.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevPostLen.current = sorted.length;
  }, [sorted.length]);

  return (
    <>
      <div ref={feedRef} className="flex-1 overflow-y-auto bg-pixel-wall px-3">
        {/* News card */}
        {latestEvent && (
          <div className="pt-3">
            <div className="border-2 border-black rounded-2xl bg-white overflow-hidden shadow-pixel-sm">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b-2 border-black bg-white">
                <Newspaper size={14} className="text-black" strokeWidth={2.2} />
                <span className="text-[10px] font-extrabold text-black tracking-wide">NEWS</span>
                <span className="text-[9px] text-pixel-muted font-bold ml-auto">
                  R{latestEvent.round} {latestEvent.timestamp}
                </span>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[12.5px] font-bold text-black leading-[1.5]">{latestEvent.text}</p>
                {priorEvents.length > 0 && (
                  <div className="mt-2 pt-2 border-t-2 border-black/10 space-y-1">
                    {priorEvents.map((ev) => (
                      <div key={ev.id} className="flex items-baseline gap-1.5 text-[10px] text-pixel-muted">
                        <span className="font-bold shrink-0">R{ev.round}</span>
                        <span className="truncate leading-[1.4]">{ev.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* All posts, newest on top */}
        {sorted.map(renderCard)}
        <div className="h-3" />
      </div>

      {/* Compose bar (new post) */}
      {onPost && <Composer mentionList={mentionList} onPost={onPost} />}
    </>
  );
}


function PostCard({
  post,
  expanded,
  toggleExpand,
  newComments,
  bumpLike,
  bumpComment,
  mentionList,
  onVote,
  firstSeen,
  onPost,
}: {
  post: Post;
  expanded: boolean;
  toggleExpand: (id: string, n: number) => void;
  newComments: boolean;
  bumpLike: boolean;
  bumpComment: boolean;
  mentionList: Agent[];
  onVote?: (input: BoardVoteInput) => void;
  onPost?: (input: BoardComposeInput) => void;
  firstSeen?: Map<string, number>;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const Icon = AGENT_ICONS[post.agentId] || AGENT_ICONS.default;
  const profileSrc = getProfileImg(post.agentId);
  const isUser = post.is_user;
  const timeLabel = _relativeTime(firstSeen?.get(post.id));

  return (
    <div className="pt-3 last:pb-3">
      <div
        className={`bg-white border-2 rounded-2xl p-3 shadow-pixel-sm ${
          isUser ? "border-pixel-greenText" : "border-black"
        }`}
      >
        {/* Author row */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-9 h-9 rounded-full border-2 border-black bg-pixel-wall flex items-center justify-center text-black overflow-hidden">
            {profileSrc ? (
              <img src={profileSrc} alt={post.agentAlias} className="w-full h-full object-cover" />
            ) : (
              <Icon size={16} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-black leading-tight flex items-center gap-1">
              {post.agentAlias}
              {isUser && (
                <span className="text-[8px] px-1.5 py-[1px] rounded-full bg-pixel-grass border border-black font-bold">
                  나
                </span>
              )}
            </div>
            <div className="text-[10px] text-pixel-muted">
              R{post.round} · {timeLabel}
            </div>
          </div>
          {/* 새 댓글 느낌표 */}
          {newComments && !expanded && (
            <span
              aria-label="새 댓글"
              className="w-[18px] h-[18px] rounded-full bg-pixel-danger text-white border-2 border-black flex items-center justify-center text-[10px] font-extrabold leading-none animate-pulse-soft"
            >
              !
            </span>
          )}
          <button className="text-pixel-muted hover:text-black cursor-pointer p-1">
            <MoreHorizontal size={14} />
          </button>
        </div>

        {/* Content */}
        <p className="text-[13px] text-black leading-[1.6] mb-2.5">{post.content}</p>

        {/* Action bar (좋아요 / 싫어요 / 댓글 / 답글) */}
        <div className="flex items-center gap-4 text-pixel-muted">
          <button
            onClick={() => onVote?.({ post_id: post.id, dir: "like" })}
            className="flex items-center gap-1 text-[11px] cursor-pointer hover:text-pixel-danger"
          >
            <Heart
              size={14}
              strokeWidth={2}
              className={bumpLike ? "animate-bump text-pixel-danger" : ""}
              fill={bumpLike ? "currentColor" : "none"}
            />
            <span className="font-bold">{post.likes}</span>
          </button>
          <button
            onClick={() => onVote?.({ post_id: post.id, dir: "dislike" })}
            className="flex items-center gap-1 text-[11px] cursor-pointer hover:text-pixel-gold"
          >
            <ThumbsDown size={14} strokeWidth={2} />
            <span className="font-bold">{post.dislikes ?? 0}</span>
          </button>
          <button
            onClick={() => toggleExpand(post.id, post.comments.length)}
            aria-expanded={expanded}
            className={`flex items-center gap-1 text-[11px] cursor-pointer ${
              expanded ? "text-pixel-blue" : "hover:text-pixel-blue"
            }`}
          >
            <MessageCircle size={14} strokeWidth={2} className={bumpComment ? "animate-bump" : ""} />
            <span className="font-bold">{post.comments.length}</span>
          </button>
          {onPost && (
            <button
              onClick={() => setReplyOpen((v) => !v)}
              className="text-[11px] font-bold cursor-pointer hover:text-black ml-auto"
            >
              답글
            </button>
          )}
        </div>

        {/* Reply composer (comment on this thread) */}
        {replyOpen && onPost && (
          <ReplyComposer
            mentionList={mentionList}
            defaultMention={post.is_user ? undefined : post.agentId}
            onSend={(text, mentionId) => {
              onPost({ text, target_thread_id: post.id, mention_agent_id: mentionId });
              setReplyOpen(false);
            }}
          />
        )}

        {/* Comments */}
        {expanded && (
          <div className="mt-3 pt-2.5 border-t-2 border-black/10 space-y-2.5">
            {post.comments.length === 0 ? (
              <p className="text-[11px] text-pixel-muted">아직 댓글이 없습니다</p>
            ) : (
              post.comments.map((c, i) => {
                const CIcon = AGENT_ICONS[c.agentId] || AGENT_ICONS.default;
                const cProfile = getProfileImg(c.agentId);
                return (
                  <div key={c.id || i} className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full border-2 border-black bg-pixel-wall flex items-center justify-center flex-shrink-0 mt-0.5 text-black overflow-hidden">
                      {cProfile ? (
                        <img src={cProfile} alt={c.agentAlias} className="w-full h-full object-cover" />
                      ) : (
                        <CIcon size={11} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 bg-pixel-wall rounded-2xl rounded-tl-md px-2.5 py-1.5">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[11px] font-bold text-black leading-tight">{c.agentAlias}</span>
                        {c.is_user && (
                          <span className="text-[8px] px-1 py-[1px] rounded-full bg-pixel-grass border border-black font-bold">
                            나
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-pixel-muted leading-[1.5]">{c.content}</p>
                      {/* comment like/dislike */}
                      <div className="flex items-center gap-3 mt-1 text-pixel-muted">
                        <button
                          onClick={() => onVote?.({ post_id: post.id, comment_id: c.id, dir: "like" })}
                          className="flex items-center gap-0.5 text-[10px] cursor-pointer hover:text-pixel-danger"
                        >
                          <Heart size={11} strokeWidth={2} />
                          <span className="font-bold">{c.likes ?? 0}</span>
                        </button>
                        <button
                          onClick={() => onVote?.({ post_id: post.id, comment_id: c.id, dir: "dislike" })}
                          className="flex items-center gap-0.5 text-[10px] cursor-pointer hover:text-pixel-gold"
                        >
                          <ThumbsDown size={11} strokeWidth={2} />
                          <span className="font-bold">{c.dislikes ?? 0}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Comment peek */}
        {post.comments.length > 0 && !expanded && (
          <button
            onClick={() => toggleExpand(post.id, post.comments.length)}
            className="mt-2 text-[11px] text-pixel-muted hover:text-black cursor-pointer"
          >
            댓글 {post.comments.length}개 보기
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Mention picker (shared) ── */
function MentionPicker({
  mentionList,
  value,
  onChange,
}: {
  mentionList: Agent[];
  value?: string;
  onChange: (id?: string, alias?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = mentionList.find((a) => a.id === value);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-2 h-8 border-2 border-black rounded-lg text-[11px] font-bold cursor-pointer ${
          selected ? "bg-pixel-grass text-black" : "bg-white text-pixel-muted hover:bg-pixel-path"
        }`}
      >
        <AtSign size={12} />
        {selected ? selected.alias : "멘션"}
        {selected && (
          <X
            size={11}
            onClick={(e) => {
              e.stopPropagation();
              onChange(undefined, undefined);
            }}
          />
        )}
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 z-50 w-[160px] max-h-[180px] overflow-y-auto bg-white border-2 border-black rounded-lg shadow-pixel-md p-1">
          {mentionList.map((a) => {
            const Icon = AGENT_ICONS[a.id] || AGENT_ICONS.default;
            return (
              <button
                key={a.id}
                onClick={() => {
                  onChange(a.id, a.alias);
                  setOpen(false);
                }}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[11px] text-black hover:bg-pixel-path cursor-pointer text-left"
              >
                <Icon size={12} />
                <span className="truncate">{a.alias}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Composer (new post) ── */
function Composer({
  mentionList,
  onPost,
}: {
  mentionList: Agent[];
  onPost: (input: BoardComposeInput) => void;
}) {
  const [text, setText] = useState("");
  const [mentionId, setMentionId] = useState<string | undefined>();

  const submit = () => {
    if (!text.trim()) return;
    onPost({ text: text.trim(), mention_agent_id: mentionId });
    setText("");
    setMentionId(undefined);
  };

  return (
    <div className="px-3 py-2 bg-white border-t-2 border-black flex items-center gap-1.5">
      <MentionPicker mentionList={mentionList} value={mentionId} onChange={(id) => setMentionId(id)} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="한마디 남기기..."
        className="flex-1 min-w-0 bg-white border-2 border-black rounded-lg px-2.5 h-8 text-[12px] text-black placeholder:text-pixel-muted focus:outline-none focus:bg-pixel-path"
      />
      <button
        onClick={submit}
        disabled={!text.trim()}
        aria-label="전송"
        className="w-8 h-8 shrink-0 bg-pixel-grass border-2 border-black rounded-lg text-black flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]"
      >
        <Send size={13} />
      </button>
    </div>
  );
}

/* ── Reply composer (comment on a thread) ── */
function ReplyComposer({
  mentionList,
  defaultMention,
  onSend,
}: {
  mentionList: Agent[];
  defaultMention?: string;
  onSend: (text: string, mentionId?: string) => void;
}) {
  const [text, setText] = useState("");
  const [mentionId, setMentionId] = useState<string | undefined>(defaultMention);

  const submit = () => {
    if (!text.trim()) return;
    onSend(text.trim(), mentionId);
    setText("");
  };

  return (
    <div className="mt-2 flex items-center gap-1.5">
      <MentionPicker mentionList={mentionList} value={mentionId} onChange={(id) => setMentionId(id)} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="답글 달기..."
        autoFocus
        className="flex-1 min-w-0 bg-white border-2 border-black rounded-lg px-2.5 h-8 text-[12px] text-black placeholder:text-pixel-muted focus:outline-none focus:bg-pixel-path"
      />
      <button
        onClick={submit}
        disabled={!text.trim()}
        aria-label="전송"
        className="w-8 h-8 shrink-0 bg-pixel-grass border-2 border-black rounded-lg text-black flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]"
      >
        <Send size={13} />
      </button>
    </div>
  );
}


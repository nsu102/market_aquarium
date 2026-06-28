"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
  Zap,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AGENT_ICONS } from "@/lib/agentIcons";
import { AGENT_PROFILES } from "@/constants/agentProfiles";

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
  onRequestEvent,
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
  /** Between rounds (round 2+): submit the next event from the board-top card. */
  onRequestEvent?: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // post id -> comment count last seen by the user (for the "new comment" 느낌표).
  const [seen, setSeen] = useState<Record<string, number>>({});
  // ids whose like/comment counter just increased -> brief bump animation.
  const [bumpedLike, setBumpedLike] = useState<Set<string>>(new Set());
  const [bumpedComment, setBumpedComment] = useState<Set<string>>(new Set());
  const prevCounts = useRef<Record<string, { likes: number; comments: number }>>({});

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
        currentRound={currentRound}
        expanded={expanded}
        toggleExpand={toggleExpand}
        hasNewComments={hasNewComments}
        bumpedLike={bumpedLike}
        bumpedComment={bumpedComment}
        agents={agents}
        snsAgents={snsAgents}
        onVote={onVote}
        onPost={onPost}
        onRequestEvent={onRequestEvent}
      />
    </div>
  );
}

/* ── Feed tab ── */
function FeedTab({
  posts,
  latestEvent,
  priorEvents,
  currentRound,
  expanded,
  toggleExpand,
  hasNewComments,
  bumpedLike,
  bumpedComment,
  agents,
  snsAgents,
  onVote,
  onPost,
  onRequestEvent,
}: {
  posts: Post[];
  latestEvent: GameEvent | null;
  priorEvents: GameEvent[];
  currentRound?: number;
  expanded: Set<string>;
  toggleExpand: (id: string, n: number) => void;
  hasNewComments: (p: Post) => boolean;
  bumpedLike: Set<string>;
  bumpedComment: Set<string>;
  agents: Agent[];
  snsAgents: Agent[];
  onVote?: (input: BoardVoteInput) => void;
  onPost?: (input: BoardComposeInput) => void;
  onRequestEvent?: (text: string) => void;
}) {
  const mentionList = useMemo(() => [...agents, ...snsAgents], [agents, snsAgents]);
  const [showPrev, setShowPrev] = useState(false);

  // Split into the current round (expanded) and earlier rounds (collapsed to a
  // thin bar). User posts ride with whatever round they were written in.
  const maxRound =
    currentRound ?? posts.reduce((m, p) => Math.max(m, p.round), 1);
  const currentPosts = posts.filter((p) => p.round >= maxRound);
  const prevPosts = posts.filter((p) => p.round < maxRound);

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
    />
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-pixel-wall px-3">
        {/* 다음 이벤트 카드 (라운드 종료 후 깜짝 등장, 라운드 2+) */}
        {onRequestEvent && (
          <NextEventCard round={maxRound + 1} onSubmit={onRequestEvent} />
        )}

        {/* News card (감정 라벨 없이 뉴스 형태로만 표시) */}
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

        {/* 이전 라운드들 — 한 줄 얇은 바로 접어두고 펼쳐서 보기 */}
        {prevPosts.length > 0 && (
          <div className="pt-3">
            <button
              onClick={() => setShowPrev((v) => !v)}
              aria-expanded={showPrev}
              className="w-full flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-black rounded-full shadow-pixel-sm text-[11px] font-bold text-pixel-muted hover:bg-pixel-path cursor-pointer"
            >
              <Layers size={13} className="text-black shrink-0" />
              <span className="text-black">이전 라운드</span>
              <span className="text-pixel-muted">글 {prevPosts.length}개</span>
              <span className="ml-auto flex items-center gap-1 text-black">
                {showPrev ? "접기" : "펼쳐보기"}
                {showPrev ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>
            {showPrev && <div className="mt-1">{prevPosts.map(renderCard)}</div>}
          </div>
        )}

        {/* 현재 라운드 글 */}
        {currentPosts.map(renderCard)}
        <div className="h-3" />
      </div>

      {/* Compose bar (new post) */}
      {onPost && <Composer mentionList={mentionList} onPost={onPost} />}
    </>
  );
}

/* ── 다음 이벤트 카드 (게시판 맨 위, 깜짝 등장) ── */
function NextEventCard({
  round,
  onSubmit,
}: {
  round: number;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };
  return (
    <div className="pt-3 animate-slide-up">
      <div className="border-2 border-pixel-greenText rounded-2xl bg-white overflow-hidden shadow-pixel-md">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b-2 border-pixel-greenText bg-pixel-grass">
          <Zap size={14} className="text-black" strokeWidth={2.4} />
          <span className="text-[10px] font-extrabold text-black tracking-wide">
            R{round} 새 이벤트
          </span>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-[11px] text-pixel-muted mb-2 leading-relaxed">
            다음 하루에 던질 뉴스를 입력하세요.
          </p>
          <div className="flex gap-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="새 이벤트..."
              autoFocus
              className="flex-1 min-w-0 bg-white border-2 border-black rounded-lg px-2.5 h-8 text-[12px] text-black placeholder:text-pixel-muted focus:outline-none focus:bg-pixel-path"
            />
            <button
              onClick={submit}
              disabled={!text.trim()}
              aria-label="이벤트 전송"
              className="w-8 h-8 shrink-0 bg-pixel-grass border-2 border-black rounded-lg text-black flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
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
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const Icon = AGENT_ICONS[post.agentId] || AGENT_ICONS.default;
  const isUser = post.is_user;

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
            <Icon size={16} />
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
              R{post.round} {post.timestamp}
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
                return (
                  <div key={c.id || i} className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full border-2 border-black bg-pixel-wall flex items-center justify-center flex-shrink-0 mt-0.5 text-black">
                      <CIcon size={11} />
                    </div>
                    <div className="flex-1 min-w-0 bg-pixel-wall rounded-2xl rounded-tl-md px-2.5 py-1.5">
                      <span className="text-[11px] font-bold text-black">
                        {c.agentAlias}
                        {c.is_user && (
                          <span className="ml-1 text-[8px] px-1 py-[1px] rounded-full bg-pixel-grass border border-black">
                            나
                          </span>
                        )}
                      </span>
                      <p className="text-[11px] text-pixel-muted leading-[1.5] mt-0.5">{c.content}</p>
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


"use client";

import { useState, useEffect, useMemo } from "react";
import { Post } from "@/mock_data/posts";
import { GameEvent } from "@/mock_data/events";
import {
  Heart,
  MessageCircle,
  Signal,
  Battery,
  Wifi,
  Search,
  MoreHorizontal,
  Share2,
  Bookmark,
  Megaphone,
} from "lucide-react";
import { AGENT_ICONS } from "@/lib/agentIcons";
import { AGENT_PROFILES } from "@/constants/agentProfiles";

// agentId -> profile image path
const PROFILE_IMG: Record<string, string> = Object.fromEntries(
  AGENT_PROFILES.map((p) => [p.id, p.profile])
);

// ponytail: tabs derived from actual post assets, not hardcoded

/** impact → notice 배너 톤 (2-Hue) */
const IMPACT_STYLES: Record<
  GameEvent["impact"],
  { bg: string; labelText: string }
> = {
  negative: { bg: "bg-pixel-danger", labelText: "속보" },
  positive: { bg: "bg-pixel-grass", labelText: "속보" },
  neutral: { bg: "bg-pixel-path", labelText: "공지" },
};

export default function BoardFeed({
  posts,
  events = [],
}: {
  posts: Post[];
  events?: GameEvent[];
}) {
  const tabs = useMemo(() => {
    const symbols = new Set(posts.filter((p) => p.agentId !== "system" && p.agentId !== "시스템" && p.asset).map((p) => p.asset!));
    return ["전체", ...Array.from(symbols).sort()];
  }, [posts]);
  const [activeTab, setActiveTab] = useState("전체");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
  );

  useEffect(() => {
    const id = setInterval(
      () =>
        setTime(
          new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
        ),
      10000
    );
    return () => clearInterval(id);
  }, []);

  // ponytail: filter out system/news posts — they already show as pinned event banner
  // ponytail: filter out system/news posts — they already show as pinned event banner
  const nonSystem = posts.filter((p) => p.agentId !== "system" && p.agentId !== "시스템");
  const byTab = activeTab === "전체" ? nonSystem : nonSystem.filter((p) => p.asset === activeTab);
  // Latest posts first
  const filtered = [...byTab].reverse();

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const priorEvents = events.length > 1 ? events.slice(0, -1).slice(-3).reverse() : [];

  const toggleLike = (id: string) => {
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleComments = (id: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full flex items-center justify-center py-2">
      {/* ── Phone device: 딥그린 베젤(검정 아님) + 둥근 화면 ── */}
      <div className="relative w-full h-full max-w-[330px] max-h-full bg-pixel-ink rounded-[40px] p-2.5 shadow-pixel-lg border-2 border-black">
        {/* Side buttons */}
        <div className="absolute -left-[3px] top-[110px] w-[3px] h-9 rounded-l bg-pixel-inkSoft" />
        <div className="absolute -left-[3px] top-[160px] w-[3px] h-14 rounded-l bg-pixel-inkSoft" />
        <div className="absolute -right-[3px] top-[140px] w-[3px] h-16 rounded-r bg-pixel-inkSoft" />

        {/* Screen */}
        <div className="relative w-full h-full bg-white rounded-[30px] overflow-hidden flex flex-col">
          {/* Status bar (위로 노치 공간 확보) */}
          <div className="relative flex items-center justify-between px-6 pt-2.5 pb-1.5 bg-white text-pixel-ink z-20">
            <span className="text-[12px] font-bold tracking-tight">{time}</span>
            <div className="flex items-center gap-1.5">
              <Signal size={13} strokeWidth={2.5} />
              <Wifi size={13} strokeWidth={2.5} />
              <Battery size={14} strokeWidth={2.5} />
            </div>
          </div>

          {/* Dynamic island (노치) */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[92px] h-[26px] bg-pixel-ink rounded-full z-30 flex items-center justify-end pr-2.5">
            <div className="w-[7px] h-[7px] rounded-full bg-pixel-inkSoft" />
          </div>

          {/* App header */}
          <div className="px-4 pt-2 pb-2.5 bg-pixel-table border-b-2 border-black">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[17px] font-extrabold text-black tracking-tight">투자 게시판</h3>
              <button
                aria-label="검색"
                className="w-8 h-8 rounded-full bg-white border-2 border-black flex items-center justify-center text-black hover:bg-pixel-path cursor-pointer active:translate-y-[1px]"
              >
                <Search size={15} />
              </button>
            </div>

            {/* Tabs (pill) */}
            <div className="flex gap-1.5">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-3 py-1 rounded-full border-2 border-black text-[11px] font-bold cursor-pointer transition-colors ${
                    activeTab === t
                      ? "bg-pixel-grass text-black"
                      : "bg-white text-pixel-muted hover:bg-pixel-path"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto bg-pixel-wall px-3">
            {/* Pinned notice */}
            {latestEvent && (
              <div className="pt-3">
                {(() => {
                  const s = IMPACT_STYLES[latestEvent.impact];
                  return (
                    <div className="border-2 border-black rounded-2xl bg-white overflow-hidden shadow-pixel-sm">
                      <div className={`flex items-center gap-2 px-3 py-1.5 border-b-2 border-black ${s.bg}`}>
                        <Megaphone size={14} className="text-black" strokeWidth={2.2} />
                        <span className="text-[9px] font-bold px-2 py-[2px] rounded-full border-2 border-black bg-white text-black tracking-wide">
                          {s.labelText}
                        </span>
                        <span className="text-[9px] text-black font-bold ml-auto">
                          R{latestEvent.round} {latestEvent.timestamp}
                        </span>
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="text-[12.5px] font-bold text-black leading-[1.5]">{latestEvent.text}</p>
                        {priorEvents.length > 0 && (
                          <div className="mt-2 pt-2 border-t-2 border-black/10 space-y-1">
                            {priorEvents.map((ev) => (
                              <div
                                key={ev.id}
                                className="flex items-baseline gap-1.5 text-[10px] text-pixel-muted"
                              >
                                <span className="font-bold shrink-0">R{ev.round}</span>
                                <span className="truncate leading-[1.4]">{ev.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Posts */}
            {filtered.map((post) => {
              const profileSrc = PROFILE_IMG[post.agentId];
              const AgentIcon = AGENT_ICONS[post.agentId] || AGENT_ICONS.default;
              const liked = likedPosts.has(post.id);
              const showComments = expandedComments.has(post.id);

              return (
                <div key={post.id} className="pt-3 last:pb-3">
                  <div className="bg-white border-2 border-black rounded-2xl p-3 shadow-pixel-sm">
                    {/* Author row */}
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-9 h-9 rounded-full border-2 border-black bg-pixel-wall flex items-center justify-center text-black overflow-hidden">
                        {profileSrc ? (
                          <img src={profileSrc} alt={post.agentAlias} className="w-full h-full object-cover" />
                        ) : (
                          <AgentIcon size={16} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-black leading-tight">
                          {post.agentAlias}
                        </div>
                        <div className="text-[10px] text-pixel-muted">
                          R{post.round} {post.timestamp}
                        </div>
                      </div>
                      <button className="text-pixel-muted hover:text-black cursor-pointer p-1">
                        <MoreHorizontal size={14} />
                      </button>
                    </div>

                    {/* Content */}
                    <p className="text-[13px] text-black leading-[1.6] mb-2.5">{post.content}</p>

                    {/* Asset tag */}
                    {post.asset && (
                      <div className="mb-2.5">
                        <span className="inline-block text-[10px] px-2.5 py-[3px] rounded-full border-2 border-black bg-pixel-water text-black font-bold">
                          {post.asset}
                        </span>
                      </div>
                    )}

                    {/* Action bar */}
                    <div className="flex items-center justify-between text-pixel-muted">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => toggleLike(post.id)}
                          className={`flex items-center gap-1 text-[11px] cursor-pointer ${
                            liked ? "text-pixel-danger" : "hover:text-pixel-danger"
                          }`}
                        >
                          <Heart size={14} fill={liked ? "currentColor" : "none"} strokeWidth={2} />
                          <span className="font-bold">{post.likes + (liked ? 1 : 0)}</span>
                        </button>
                        <button
                          onClick={() => toggleComments(post.id)}
                          aria-expanded={showComments}
                          className={`flex items-center gap-1 text-[11px] cursor-pointer ${
                            showComments ? "text-pixel-blue" : "hover:text-pixel-blue"
                          }`}
                        >
                          <MessageCircle size={14} strokeWidth={2} />
                          <span className="font-bold">{post.comments.length}</span>
                        </button>
                        <button className="hover:text-pixel-blue cursor-pointer">
                          <Share2 size={13} strokeWidth={2} />
                        </button>
                      </div>
                      <button className="hover:text-pixel-gold cursor-pointer">
                        <Bookmark size={14} strokeWidth={2} />
                      </button>
                    </div>

                    {/* Comments */}
                    {showComments && (
                      <div className="mt-3 pt-2.5 border-t-2 border-black/10 space-y-2.5">
                        {post.comments.length === 0 ? (
                          <p className="text-[11px] text-pixel-muted">아직 댓글이 없습니다</p>
                        ) : (
                          post.comments.map((c, i) => {
                            const cProfile = PROFILE_IMG[c.agentId];
                            const CIcon = AGENT_ICONS[c.agentId] || AGENT_ICONS.default;
                            return (
                              <div key={i} className="flex items-start gap-2">
                                <div className="w-6 h-6 rounded-full border-2 border-black bg-pixel-wall flex items-center justify-center flex-shrink-0 mt-0.5 text-black overflow-hidden">
                                  {cProfile ? (
                                    <img src={cProfile} alt={c.agentAlias} className="w-full h-full object-cover" />
                                  ) : (
                                    <CIcon size={11} />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 bg-pixel-wall rounded-2xl rounded-tl-md px-2.5 py-1.5">
                                  <span className="text-[11px] font-bold text-black">{c.agentAlias}</span>
                                  <p className="text-[11px] text-pixel-muted leading-[1.5] mt-0.5">
                                    {c.content}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* Comment peek */}
                    {post.comments.length > 0 && !showComments && (
                      <button
                        onClick={() => toggleComments(post.id)}
                        className="mt-2 text-[11px] text-pixel-muted hover:text-black cursor-pointer"
                      >
                        댓글 {post.comments.length}개 보기
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="h-3" />
          </div>

          {/* Home indicator */}
          <div className="flex justify-center py-2 bg-pixel-wall">
            <div className="w-[110px] h-[5px] rounded-full bg-pixel-ink/40" />
          </div>
        </div>
      </div>
    </div>
  );
}

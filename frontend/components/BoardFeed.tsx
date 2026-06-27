"use client";

import { useState, useEffect } from "react";
import { Post } from "@/mock_data/posts";
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
} from "lucide-react";
import { AGENT_ICONS } from "@/lib/agentIcons";

const tabs = ["전체", "BTC", "ETH", "SOL"];

export default function BoardFeed({ posts }: { posts: Post[] }) {
  const [activeTab, setActiveTab] = useState("전체");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [time, setTime] = useState(() => new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }));

  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })), 10000);
    return () => clearInterval(id);
  }, []);

  const filtered =
    activeTab === "전체"
      ? posts
      : posts.filter((p) => p.asset === activeTab);

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
    <div className="h-full flex flex-col items-center justify-center bg-surface-tertiary/40 py-3 px-3">
      {/* Phone device */}
      <div className="flex flex-col w-full h-full max-w-[340px] rounded-[2.5rem] border-[3px] border-text-primary/12 bg-surface-card overflow-hidden shadow-phone relative">

        {/* Notch area */}
        <div className="bg-surface-card px-6 pt-2.5 pb-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-secondary font-mono font-semibold">{time}</span>
            <div className="w-[72px] h-[20px] bg-text-primary rounded-full" />
            <div className="flex items-center gap-1 text-text-secondary">
              <Signal size={10} strokeWidth={2.5} />
              <Wifi size={10} strokeWidth={2.5} />
              <Battery size={10} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* App header */}
        <div className="px-5 pt-3 pb-2 bg-surface-card">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[17px] font-bold text-text-primary tracking-tight">
              투자 게시판
            </h3>
            <button className="w-8 h-8 rounded-full bg-surface-secondary flex items-center justify-center text-text-tertiary hover:text-text-secondary transition cursor-pointer">
              <Search size={15} />
            </button>
          </div>

          {/* Tabs - pill style */}
          <div className="flex gap-1.5">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                  activeTab === t
                    ? "bg-text-primary text-surface-card"
                    : "bg-surface-secondary text-text-tertiary hover:text-text-secondary hover:bg-surface-tertiary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border-light" />

        {/* Posts feed */}
        <div className="flex-1 overflow-y-auto bg-surface-secondary/30">
          {filtered.map((post, idx) => {
            const AgentIcon = AGENT_ICONS[post.agentId] || AGENT_ICONS.default;
            const liked = likedPosts.has(post.id);
            const showComments = expandedComments.has(post.id);

            return (
              <div
                key={post.id}
                className={`bg-surface-card px-4 py-3.5 ${
                  idx < filtered.length - 1 ? "border-b border-border-light" : ""
                }`}
              >
                {/* Author row */}
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-9 h-9 rounded-full bg-surface-secondary border border-border-light flex items-center justify-center text-text-secondary">
                    <AgentIcon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-text-primary leading-tight">
                      {post.agentAlias}
                    </div>
                    <div className="text-[10px] text-text-tertiary font-mono">
                      R{post.round} {post.timestamp}
                    </div>
                  </div>
                  <button className="text-text-tertiary hover:text-text-secondary transition cursor-pointer p-1">
                    <MoreHorizontal size={14} />
                  </button>
                </div>

                {/* Content */}
                <p className="text-[13px] text-text-primary leading-[1.6] mb-2.5">
                  {post.content}
                </p>

                {/* Asset tag */}
                {post.asset && (
                  <div className="mb-2.5">
                    <span className="inline-block text-[10px] px-2 py-[3px] rounded-md bg-accent-green/8 text-accent-green font-semibold">
                      {post.asset}
                    </span>
                  </div>
                )}

                {/* Action bar */}
                <div className="flex items-center justify-between text-text-tertiary">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={`flex items-center gap-1 text-[11px] transition cursor-pointer ${
                        liked ? "text-accent-red" : "hover:text-accent-red"
                      }`}
                    >
                      <Heart size={14} fill={liked ? "currentColor" : "none"} strokeWidth={1.8} />
                      <span className="font-medium">{post.likes + (liked ? 1 : 0)}</span>
                    </button>
                    <button
                      onClick={() => toggleComments(post.id)}
                      className="flex items-center gap-1 text-[11px] hover:text-accent-blue transition cursor-pointer"
                    >
                      <MessageCircle size={14} strokeWidth={1.8} />
                      <span className="font-medium">{post.comments.length}</span>
                    </button>
                    <button className="hover:text-accent-blue transition cursor-pointer">
                      <Share2 size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                  <button className="hover:text-accent-gold transition cursor-pointer">
                    <Bookmark size={14} strokeWidth={1.8} />
                  </button>
                </div>

                {/* Comments (expandable) */}
                {post.comments.length > 0 && showComments && (
                  <div className="mt-3 pt-2.5 border-t border-border-light space-y-2.5">
                    {post.comments.map((c, i) => {
                      const CIcon = AGENT_ICONS[c.agentId] || AGENT_ICONS.default;
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                            <CIcon size={11} className="text-text-tertiary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-text-primary">
                              {c.agentAlias}
                            </span>
                            <p className="text-[11px] text-text-secondary leading-[1.5] mt-0.5">
                              {c.content}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Comment peek */}
                {post.comments.length > 0 && !showComments && (
                  <button
                    onClick={() => toggleComments(post.id)}
                    className="mt-2 text-[11px] text-text-tertiary hover:text-text-secondary transition cursor-pointer"
                  >
                    댓글 {post.comments.length}개 보기
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Home indicator */}
        <div className="flex justify-center py-2 bg-surface-card border-t border-border-light">
          <div className="w-[100px] h-[4px] bg-text-primary/12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

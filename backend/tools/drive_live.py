"""Mimic the frontend ReverieGame loop against the running servers to verify the
canonical live stack end-to-end (control_server :8001 + api_server :8000).

Run while both servers are up (control_server ideally in MARKET_STUB_LLM mode for speed):
    python backend/tools/drive_live.py
"""
import json
import sys
import time
import urllib.request

API = "http://127.0.0.1:8000"
CTRL = "http://127.0.0.1:8001"


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def get(url):
    return json.load(urllib.request.urlopen(url, timeout=60))


def main():
    sim = "market_drive_%d" % int(time.time())
    print("start:", post(f"{CTRL}/control/start",
                         {"fork_sim_code": "base_the_ville_market6", "sim_code": sim}))
    print("run:", post(f"{CTRL}/control/run", {"count": 400}))
    time.sleep(1)
    print("event:", post(f"{CTRL}/control/market/event",
                        {"text": "대형 거래소 해킹 루머가 퍼졌다", "is_rumor": True}))

    home = get(f"{API}/api/home")
    names = [p["original"] for p in home["persona_names"]]
    pos = {n: {"maze": "the_ville", "x": x, "y": y}
           for n, x, y in home["persona_init_pos"]}

    board = exch = 0
    for step in range(400):
        # post current positions for this step, then wait for movement
        post(f"{API}/api/environment/process",
             {"step": step, "sim_code": sim, "environment": pos})
        mv = None
        for _ in range(100):
            r = post(f"{API}/api/environment/update", {"step": step, "sim_code": sim})
            if r.get("<step>") == step:   # api marks readiness with the literal "<step>" key
                mv = r
                break
            time.sleep(0.05)
        if mv is None:
            print("step", step, "timed out waiting for movement")
            break
        personas = mv["persona"]
        for n in names:
            m = personas[n]["movement"]
            pos[n] = {"maze": "the_ville", "x": m[0], "y": m[1]}
        meta = mv.get("meta", {})
        descs = " | ".join(personas[n]["description"] for n in names)
        if "Hobbs Cafe" in descs and board == 0:
            board = step
            print(f"  step {step}: someone AT/HEADING board. posts={len(meta.get('posts', []))}")
        if "Willows Market" in descs and exch == 0:
            exch = step
            print(f"  step {step}: someone AT/HEADING exchange.")
        mk = meta.get("market") or {}
        if step % 40 == 0:
            print(f"step {step} time={meta.get('curr_time')} round={meta.get('round')} "
                  f"posts={len(meta.get('posts', []))} fgi={mk.get('fearGreedIndex')}")
        if len(meta.get("posts", [])) > 1:
            # market actions started producing posts
            if step > (board or 0) + 5:
                pass
    print("done. board_step=", board, "exch_step=", exch)
    print("exit:", post(f"{CTRL}/control/exit", {}))


if __name__ == "__main__":
    main()

/* eslint-disable max-lines -- Client-side JS template, single runtime concern. */
export function logsScript(escaped: string): string {
  return `${stateAndClassifiers(escaped)}${renderAndCopy()}${scrollAndPolling()}`;
}

function stateAndClassifiers(escaped: string): string {
  return `
    const ISSUE = "${escaped}";
    let allEvents = [];
    let currentFilter = "all";
    let autoScroll = true;
    let lastEventCount = 0;

    const NOISE_MESSAGES = new Set([
      "codex/event/agent_message_delta",
      "codex/event/agent_message_content_delta",
      "item/agentMessage/delta",
      "codex/event/token_count",
      "account/rateLimits/updated",
      "item/reasoning/textDelta",
      "item/reasoning/summaryTextDelta",
      "item/reasoning/summaryPartAdded",
      "codex/event/reasoning_delta",
      "thread/status/changed",
      "codex/event/task_complete",
    ]);

    function classifyEvent(ev) {
      const msg = ev.message || "";
      const evType = ev.event || "";
      if (msg.includes("error") || msg.includes("stream_error") || evType.includes("error")) return "error";
      if (evType === "turn_started" || evType === "turn_completed") return "turn";
      if (evType === "token_usage_updated") return "token";
      if (msg.startsWith("agentMessage") || msg.includes("agent_message")) return "message";
      if (msg.startsWith("reasoning")) return "reasoning";
      if (msg.startsWith("commandExecution") || msg.includes("exec_command")) return "command";
      if (msg.startsWith("dynamicToolCall")) return "tool";
      if (msg.startsWith("fileChange")) return "file";
      if (msg.startsWith("webSearch")) return "search";
      if (msg.startsWith("userMessage")) return "user";
      return "other";
    }

    function parseVerb(msg) {
      if (!msg) return null;
      if (msg.includes(" started")) return "started";
      if (msg.includes(" completed")) return "completed";
      return null;
    }

    function parseId(msg) {
      if (!msg) return null;
      const parts = msg.split(" ");
      return parts.length >= 2 ? parts[1] : null;
    }

    function formatTime(iso) {
      if (!iso) return "--:--:--";
      return new Date(iso).toISOString().slice(11, 19);
    }

    function shouldShow(ev) {
      const msg = ev.message || "";
      if (NOISE_MESSAGES.has(msg)) return false;
      if (ev.event === "other_message" && !msg.includes("error") && !msg.includes("stream_error")) return false;
      return true;
    }

    function matchesFilter(type) {
      if (currentFilter === "all") return true;
      if (currentFilter === "error") return type === "error";
      if (currentFilter === "message") return type === "message" || type === "user";
      if (currentFilter === "reasoning") return type === "reasoning";
      if (currentFilter === "command") return type === "command";
      if (currentFilter === "tool") return type === "tool";
      if (currentFilter === "file") return type === "file";
      return true;
    }

    function typeLabel(type) {
      const labels = {
        message: "Agent Message", reasoning: "Reasoning", command: "Command",
        tool: "Tool Call", file: "File Change", turn: "Turn", error: "Error",
        search: "Web Search", token: "Tokens", user: "User Prompt", other: "Event",
      };
      return labels[type] || "Event";
    }

    function contentClass(type) {
      const map = {
        message: "content-message", reasoning: "content-reasoning", command: "content-command",
        tool: "content-tool", file: "content-file", error: "content-error", user: "content-user",
      };
      return map[type] || "content-command";
    }

    function escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    function formatNumber(n) {
      return new Intl.NumberFormat("en-US").format(Number(n || 0));
    }`;
}

function renderAndCopy(): string {
  return `
    function renderEvents() {
      const container = document.getElementById("logContainer");
      const visible = allEvents.filter(ev => shouldShow(ev));
      const filtered = visible.filter(ev => matchesFilter(classifyEvent(ev)));

      document.getElementById("eventCount").textContent = String(visible.length);
      document.getElementById("shownCount").textContent = String(filtered.length);

      container.innerHTML = "";

      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">⌛</span><p>No events yet. Waiting for agent activity...</p></div>';
        return;
      }

      const ordered = [...filtered].reverse();
      for (const ev of ordered) {
        const type = classifyEvent(ev);
        const verb = parseVerb(ev.message);
        const id = parseId(ev.message);

        if (type === "turn") {
          const label = verb === "started" ? "Turn Started" : "Turn Completed";
          const div = document.createElement("div");
          div.className = "turn-divider";
          div.innerHTML = '<span>' + label + ' — ' + formatTime(ev.at) + '</span>';
          container.appendChild(div);
          continue;
        }

        const entry = document.createElement("div");
        entry.className = "log-entry" + (ev._new ? " highlight" : "");

        let html = '<div class="log-header">';
        html += '<span class="log-time">' + formatTime(ev.at) + '</span>';
        html += '<span class="log-type type-' + type + '">' + typeLabel(type) + '</span>';
        if (verb) html += '<span class="log-verb">' + verb + '</span>';
        if (id && id.length < 60) html += '<span class="log-id">' + id.substring(0, 24) + '</span>';
        html += '</div>';

        if (ev.content) {
          html += '<div class="log-content ' + contentClass(type) + '">' + escapeHtml(ev.content) + '</div>';
        } else if (type === "token" && ev.usage) {
          html += '<div class="log-message" style="color:var(--text-dim);font-size:12px;font-family:var(--mono)">';
          html += 'IN ' + formatNumber(ev.usage.inputTokens) + ' / OUT ' + formatNumber(ev.usage.outputTokens) + ' / TTL ' + formatNumber(ev.usage.totalTokens);
          html += '</div>';
        }

        entry.innerHTML = html;
        container.appendChild(entry);
      }

      if (autoScroll) {
        document.getElementById("scrollAnchor").scrollIntoView({ behavior: "smooth" });
      }
    }

    function copyLogs() {
      const visible = allEvents.filter(ev => shouldShow(ev));
      const filtered = visible.filter(ev => matchesFilter(classifyEvent(ev)));
      const lines = filtered.map(ev => {
        const type = classifyEvent(ev);
        const time = formatTime(ev.at);
        const label = typeLabel(type).toUpperCase();
        let line = '[' + time + '] [' + label + '] ' + (ev.message || '');
        if (ev.content) line += '\\\\n' + ev.content;
        return line;
      });
      const header = '=== Symphony Logs: ' + ISSUE + ' (' + new Date().toISOString() + ') ===';
      const text = header + '\\\\n' + lines.join('\\\\n---\\\\n') + '\\\\n=== End of Logs ===';
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyLogsBtn');
        btn.innerHTML = '<span class="icon" style="font-size:16px">✓</span> Copied!';
        setTimeout(() => { btn.innerHTML = '<span class="icon" style="font-size:16px">⧉</span> Copy Logs'; }, 2000);
      });
    }`;
}

function scrollAndPolling(): string {
  return `
    function scrollToBottom() {
      document.getElementById("scrollAnchor").scrollIntoView({ behavior: "smooth" });
      autoScroll = true;
      document.getElementById("autoScrollToggle").checked = true;
    }

    async function loadEvents() {
      try {
        const resp = await fetch("/api/v1/" + encodeURIComponent(ISSUE));
        if (!resp.ok) return;
        const detail = await resp.json();

        document.getElementById("issueTitle").textContent = detail.title || ISSUE;
        const badge = document.getElementById("statusBadge");
        badge.textContent = (detail.status || "unknown").toUpperCase();
        badge.className = "badge " + (detail.status === "running" ? "badge-live" : "badge-id");

        const events = Array.isArray(detail.recentEvents) ? [...detail.recentEvents].reverse() : [];
        const isNew = events.length > lastEventCount;
        if (isNew) {
          for (let i = lastEventCount; i < events.length; i++) {
            events[i]._new = true;
          }
        }
        lastEventCount = events.length;
        allEvents = events;
        renderEvents();
      } catch (e) {
        console.error("Failed to load events:", e);
      }
    }

    document.querySelectorAll("[data-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderEvents();
      });
    });

    document.getElementById("autoScrollToggle").addEventListener("change", (e) => {
      autoScroll = e.target.checked;
    });

    window.addEventListener("scroll", () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
      document.getElementById("scrollToBottom").classList.toggle("visible", !nearBottom && allEvents.length > 10);
      if (nearBottom) autoScroll = true;
    });

    loadEvents();
    setInterval(loadEvents, 3000);`;
}

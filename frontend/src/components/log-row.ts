import type { RecentEvent } from "../types/runtime.js";
import { classifyEvent, getEventTooltip, stringifyPayload } from "../utils/events";
import { eventChip } from "../ui/event-chip";
import { formatShortTime } from "../utils/format";

interface LogRowOptions {
  event: RecentEvent;
  expanded: boolean;
  highlightedText?: string;
  onToggle?: () => void;
}

function highlightText(text: string, query: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const needle = query.trim();
  if (!needle) {
    fragment.append(text);
    return fragment;
  }
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  let offset = 0;
  while (offset < text.length) {
    const nextIndex = lower.indexOf(target, offset);
    if (nextIndex === -1) {
      fragment.append(text.slice(offset));
      break;
    }
    if (nextIndex > offset) {
      fragment.append(text.slice(offset, nextIndex));
    }
    const mark = document.createElement("mark");
    mark.textContent = text.slice(nextIndex, nextIndex + needle.length);
    fragment.append(mark);
    offset = nextIndex + needle.length;
  }
  return fragment;
}

function buildCopyButton(getText: () => string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mc-log-copy-btn";
  btn.title = "Copy to clipboard";
  btn.setAttribute("aria-label", "Copy to clipboard");
  btn.textContent = "⎘";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getText()).then(
      () => {
        btn.textContent = "✓";
        setTimeout(() => {
          btn.textContent = "⎘";
        }, 1200);
      },
      () => undefined,
    );
  });
  return btn;
}

function isDiff(content: string): boolean {
  return content.startsWith("diff --git") || /^---\s+a\//m.test(content);
}

function buildThinkingBlock(content: string): HTMLElement {
  const wordCount = content.trim().split(/\s+/).length;
  const isShort = content.length <= 500;

  const block = document.createElement("div");
  block.className = isShort ? "mc-log-thinking is-open" : "mc-log-thinking";

  const blockHeader = document.createElement("div");
  blockHeader.className = "mc-log-thinking-header";

  const label = document.createElement("span");
  label.className = "mc-log-thinking-label";
  label.textContent = "Thinking";

  const wordsEl = document.createElement("span");
  wordsEl.className = "mc-log-thinking-words";
  wordsEl.textContent = `${wordCount} words`;

  const copyBtn = buildCopyButton(() => content);
  blockHeader.append(label, wordsEl, copyBtn);

  const body = document.createElement("pre");
  body.className = "mc-log-thinking-body";
  body.textContent = content;
  body.hidden = !isShort;

  block.append(blockHeader, body);

  blockHeader.addEventListener("click", (e) => {
    e.stopPropagation();
    body.hidden = !body.hidden;
    block.classList.toggle("is-open", !body.hidden);
  });

  return block;
}

function buildProseBlock(content: string): HTMLElement {
  const block = document.createElement("div");
  block.className = "mc-log-prose";

  const copyBtn = buildCopyButton(() => content);
  block.append(copyBtn);

  const body = document.createElement("div");
  body.className = "mc-log-prose-body";
  body.textContent = content;
  block.append(body);

  return block;
}

function buildDiffBlock(content: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "mc-log-diff-wrapper";

  const copyBtn = buildCopyButton(() => content);
  wrapper.append(copyBtn);

  const pre = document.createElement("pre");
  pre.className = "mc-log-diff";

  for (const line of content.split("\n")) {
    const span = document.createElement("span");
    span.className = "mc-log-diff-line";
    if (line.startsWith("+") && !line.startsWith("+++")) {
      span.classList.add("is-add");
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      span.classList.add("is-del");
    } else if (line.startsWith("@@")) {
      span.classList.add("is-hunk");
    }
    span.textContent = line + "\n";
    pre.append(span);
  }

  wrapper.append(pre);
  return wrapper;
}

function buildCollapsiblePanel(event: RecentEvent, payload: string, expanded: boolean): HTMLElement {
  const isDiffContent = (event.event === "tool_edit" || event.metadata?.isDiff === true) && isDiff(payload);
  if (isDiffContent) {
    const panel = buildDiffBlock(payload);
    panel.hidden = !expanded;
    return panel;
  }
  const pre = document.createElement("pre");
  pre.className = "mc-log-payload";
  pre.textContent = payload;
  pre.hidden = !expanded;
  return pre;
}

function appendPayloadPanel(
  row: HTMLElement,
  event: RecentEvent,
  payload: string,
  isReasoningEvent: boolean,
  isAgentMessageEvent: boolean,
  expanded: boolean,
  onToggle: (() => void) | undefined,
): void {
  if (isReasoningEvent) {
    row.append(buildThinkingBlock(payload));
    return;
  }
  if (isAgentMessageEvent) {
    row.append(buildProseBlock(payload));
    return;
  }
  const panel = buildCollapsiblePanel(event, payload, expanded);
  row.append(panel);
  row.addEventListener("click", () => onToggle?.());
}

export function createLogRow(options: LogRowOptions): HTMLElement {
  const { event, expanded, highlightedText = "", onToggle } = options;
  const payload = stringifyPayload(event.content);
  const eventClass = classifyEvent(event);
  const isReasoningEvent = event.event === "reasoning";
  const isAgentMessageEvent = event.event === "agent_message" || event.event === "agent_output";
  // Inline panels (reasoning, agent message) are always visible — no row-level toggle
  const isInlinePanel = isReasoningEvent || isAgentMessageEvent;

  const row = document.createElement("article");
  row.className = "mc-log-row";
  row.classList.add(`is-${eventClass}`);

  if (payload && !isInlinePanel) {
    row.classList.add("has-payload");
    row.classList.add("is-collapsible");
    if (expanded) row.classList.add("is-expanded");
  }

  const header = document.createElement("div");
  header.className = "mc-log-row-header";

  // Chevron only for click-to-expand rows
  if (payload && !isInlinePanel) {
    const chevron = document.createElement("span");
    chevron.className = "mc-log-chevron";
    chevron.setAttribute("aria-hidden", "true");
    header.append(chevron);
  }

  const timestamp = document.createElement("time");
  timestamp.className = "mc-log-time";
  timestamp.dateTime = event.at;
  timestamp.textContent = formatShortTime(event.at);

  const chip = eventChip(event);
  chip.title = getEventTooltip(event.event) || event.event;

  const message = document.createElement("p");
  message.className = "mc-log-message";
  message.append(highlightText(event.message, highlightedText));
  if (event.message !== event.event) {
    message.title = event.event;
  }

  header.append(timestamp, chip, message);
  row.append(header);

  if (payload) {
    appendPayloadPanel(row, event, payload, isReasoningEvent, isAgentMessageEvent, expanded, onToggle);
  }

  return row;
}

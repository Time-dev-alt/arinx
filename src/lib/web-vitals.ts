/**
 * Tiny, dependency-free Core Web Vitals probe.
 *
 * Reports LCP / CLS / INP / FCP / TTFB and long tasks to the first-party
 * `/rum` beacon. Only the metric name, a rounded numeric value and the
 * pathname (never the query string, user id or referrer) leave the browser.
 * The server endpoint validates and rate limits every beacon.
 */

type MetricName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB" | "LONG_TASK";

const MAX_BEACONS = 12;
let started = false;

function send(metric: MetricName, value: number, sent: { count: number }): void {
  if (!Number.isFinite(value) || value < 0 || sent.count >= MAX_BEACONS) return;
  sent.count += 1;
  const body = JSON.stringify({
    metric,
    value: Math.round(value * (metric === "CLS" ? 1000 : 1)),
    path: location.pathname.slice(0, 200),
  });
  try {
    if (navigator.sendBeacon?.("/rum", new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* fall through to fetch */
  }
  void fetch("/rum", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    keepalive: true,
  }).catch(() => {});
}

function observe(
  type: string,
  handler: (entries: PerformanceEntryList) => void,
  sent: { count: number },
): PerformanceObserver | null {
  try {
    const observer = new PerformanceObserver((list) => handler(list.getEntries()));
    observer.observe({ type, buffered: true });
    return observer;
  } catch {
    // Older browsers do not support every entry type.
    return null;
  }
}

/** Returns a cleanup function; safe to call more than once. */
export function startWebVitals(): () => void {
  if (started || typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return () => {};
  }
  started = true;
  const sent = { count: 0 };
  const observers: PerformanceObserver[] = [];
  const add = (observer: PerformanceObserver | null) => {
    if (observer) observers.push(observer);
  };

  add(
    observe(
      "paint",
      (entries) => {
        const fcp = entries.find((entry) => entry.name === "first-contentful-paint");
        if (fcp) send("FCP", fcp.startTime, sent);
      },
      sent,
    ),
  );

  let lcpValue = 0;
  add(
    observe(
      "largest-contentful-paint",
      (entries) => {
        for (const entry of entries) lcpValue = Math.max(lcpValue, entry.startTime);
      },
      sent,
    ),
  );

  let clsValue = 0;
  add(
    observe(
      "layout-shift",
      (entries) => {
        for (const entry of entries) {
          if ((entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) continue;
          clsValue += (entry as PerformanceEntry & { value?: number }).value ?? 0;
        }
      },
      sent,
    ),
  );

  let inpValue = 0;
  add(
    observe(
      "event",
      (entries) => {
        for (const entry of entries) {
          if ((entry as PerformanceEntry & { interactionId?: number }).interactionId) {
            inpValue = Math.max(inpValue, entry.duration);
          }
        }
      },
      sent,
    ),
  );

  let longestTask = 0;
  add(
    observe(
      "longtask",
      (entries) => {
        for (const entry of entries) longestTask = Math.max(longestTask, entry.duration);
      },
      sent,
    ),
  );

  try {
    const navigation = performance.getEntriesByType("navigation")[0] as
      (PerformanceEntry & { responseStart?: number }) | undefined;
    if (navigation?.responseStart) send("TTFB", navigation.responseStart, sent);
  } catch {
    /* navigation timing unavailable */
  }

  const flush = () => {
    if (document.visibilityState !== "hidden") return;
    if (lcpValue) send("LCP", lcpValue, sent);
    if (clsValue) send("CLS", clsValue, sent);
    if (inpValue) send("INP", inpValue, sent);
    if (longestTask) send("LONG_TASK", longestTask, sent);
  };
  document.addEventListener("visibilitychange", flush);

  return () => {
    document.removeEventListener("visibilitychange", flush);
    for (const observer of observers) observer.disconnect();
    started = false;
  };
}

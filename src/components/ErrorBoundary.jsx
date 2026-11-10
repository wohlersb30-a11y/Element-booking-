import React from "react";

// App-wide safety net. If any component throws while rendering, React would
// normally unmount the whole tree and leave a blank white screen. This boundary
// catches that, logs it, and shows a friendly branded recovery screen with a
// way to reload or head back to booking. It also auto-clears when the route
// changes (via the `resetKey` prop) so a crash on one page never traps the user.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorText: "", stackText: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorText: (error && (error.message || String(error))) || "Unknown error"
    };
  }

  componentDidCatch(error, info) {
    // Surface for debugging / future error-reporting hookup.
    console.error("App error boundary caught an error:", error, info);
    // Retain the error + the React component stack so support can read the
    // exact failing component off the screen when a customer calls — the next
    // crash becomes diagnosable instead of console-only.
    this.setState({
      errorText: (error && (error.message || String(error))) || "Unknown error",
      stackText: (info && info.componentStack ? String(info.componentStack) : "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 6)
        .join("\n")
    });
  }

  componentDidUpdate(prevProps) {
    // Navigating to a different route should recover the app automatically.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorText: "", stackText: "" });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#2d5567]/10 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-[#2d5567]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2 heading-font">
            Something went wrong
          </h1>
          <p className="text-slate-600 mb-6">
            We hit an unexpected hiccup. Your bookings and data are safe — please
            try again. If it keeps happening, give us a call and we'll help right
            away.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="h-11 px-5 rounded-xl bg-[#2d5567] hover:bg-[#24455480] text-white font-semibold transition-colors"
            >
              Reload the page
            </button>
            <button
              onClick={() => {
                window.location.href = "/";
              }}
              className="h-11 px-5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold transition-colors"
            >
              Back to booking
            </button>
          </div>

          {/* Open by default (temporary) so the exact error + failing component
              is on-screen the moment a crash happens — staff/callers can read it
              straight off the page and relay it, which makes an otherwise
              hard-to-reproduce crash diagnosable. Re-collapse once pinned down. */}
          {(this.state.errorText || this.state.stackText) && (
            <details className="mt-6 text-left" open>
              <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 select-none">
                Technical details (please read these to support)
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] leading-relaxed text-slate-600">
                {this.state.errorText}
                {this.state.stackText ? `\n\n${this.state.stackText}` : ""}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

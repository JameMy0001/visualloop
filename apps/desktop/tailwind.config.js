/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          app: "var(--surface-app)",
          panel: "var(--surface-panel)",
          subtle: "var(--surface-subtle)",
          hover: "var(--surface-hover)",
          pressed: "var(--surface-pressed)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          disabled: "var(--text-disabled)",
        },
        border: {
          subtle: "var(--border-subtle)",
          default: "var(--border-default)",
          strong: "var(--border-strong)",
        },
        action: {
          primary: "var(--action-primary)",
          hover: "var(--action-primary-hover)",
          text: "var(--action-primary-text)",
        },
        status: {
          success: "var(--status-success)",
          warning: "var(--status-warning)",
          error: "var(--status-error)",
          info: "var(--status-info)",
        },
      },
      borderRadius: {
        control: "var(--radius-control)",
        panel: "var(--radius-panel)",
        window: "var(--radius-window)",
      },
    },
  },
  plugins: [],
};

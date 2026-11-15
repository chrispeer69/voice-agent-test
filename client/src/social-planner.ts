// Both sections share an origin in the combined Railway deployment.
export function setupSocialPlanner(shell: HTMLElement) {
  const nav = document.createElement("nav");
  nav.className = "lab-navigation";
  nav.setAttribute("aria-label", "Website sections");
  const voice = document.createElement("a");
  voice.href = import.meta.env.BASE_URL;
  voice.textContent = "Voice Lab";
  voice.setAttribute("aria-current", "page");
  const planner = document.createElement("a");
  planner.href = import.meta.env.VITE_SOCIAL_PLANNER_URL || (import.meta.env.DEV ? "http://localhost:3000/" : "/");
  planner.textContent = "Social Planner";
  nav.append(voice, planner);
  shell.querySelector(".topbar")!.after(nav);
}

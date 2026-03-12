export type RouterLike = {
  push: (href: string) => void;
};

export function openNewChat(router: RouterLike) {
  window.dispatchEvent(new CustomEvent("new-chat"));
  router.push("/chat");
}

/**
 * Browser notification for critical incidents.
 */
export async function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

export function notifySevereIncident(count: number) {
  if ("Notification" in window && Notification.permission === "granted" && count > 0) {
    new Notification("⚠️ Crisis Alert", {
      body: `${count} severe incident${count > 1 ? "s" : ""} detected in West London`,
      icon: "/react.svg",
      tag: "severe-incidents", // prevents duplicate notifications
    });
  }
}

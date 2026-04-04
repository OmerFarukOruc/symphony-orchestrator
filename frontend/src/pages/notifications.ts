import "../styles/notifications.css";
import { createNotificationsPage } from "../views/notifications-view";

export function render(): HTMLElement {
  return createNotificationsPage();
}

import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { ServerAppRouter } from "./components/AppRouter";

export function render(url = "/") {
  const html = renderToString(
    <StrictMode>
      <ServerAppRouter location={url} />
    </StrictMode>,
  );
  return { html };
}

/**
 * Returns an HTML page that renders Swagger UI from CDN.
 *
 * The page fetches `/api/v1/openapi.json` from the same host
 * and renders it using swagger-ui-dist from unpkg.
 */

const SWAGGER_CDN = "https://unpkg.com/swagger-ui-dist@5";

/** Returns a self-contained HTML string for the Swagger UI docs page. */
export function getSwaggerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Symphony API Docs</title>
  <link rel="stylesheet" href="${SWAGGER_CDN}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_CDN}/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: "/api/v1/openapi.json", dom_id: "#swagger-ui" });
  </script>
</body>
</html>`;
}

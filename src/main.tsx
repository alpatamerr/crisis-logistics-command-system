import { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { OsdkProvider2 } from "@osdk/react/experimental";
import client from "@/client";
import ErrorBoundary from "@/components/ErrorBoundary";
import Loading from "@/components/Loading";
import { router } from "@/router";
import "normalize.css";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <ErrorBoundary>
    <Suspense fallback={<Loading />}>
      <OsdkProvider2 client={client}>
        <RouterProvider router={router} />
      </OsdkProvider2>
    </Suspense>
  </ErrorBoundary>,
);

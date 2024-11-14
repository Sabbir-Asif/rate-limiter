import * as React from "react";
import * as ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import "./index.css";
import RateLimiter from "./Components/RateLimiter";
import RateLimitDemo from "./Components/RateLimitDemo";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RateLimiter />
  },
  {
    path: '/autoRetry',
    element: <RateLimitDemo />
  }
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

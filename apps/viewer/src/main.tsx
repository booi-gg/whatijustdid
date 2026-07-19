import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { readViewerModel } from "./viewer";

const root = document.querySelector("#root");

if (!root) throw new Error("Viewer root element was not found");

const model = readViewerModel();
document.title = `${model.projectName} · whatijustdid`;

createRoot(root).render(
  <StrictMode>
    <App model={model} />
  </StrictMode>,
);

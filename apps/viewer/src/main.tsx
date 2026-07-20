import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { readViewerModel } from "./viewer/readViewerModel";
import { ViewerApp } from "./viewer/ViewerApp";

const root = document.querySelector("#root");

if (!root) throw new Error("Viewer root element was not found");

const model = readViewerModel();
document.title = `${model.projectName} · whatijustdid`;

createRoot(root).render(
  <StrictMode>
    <ViewerApp model={model} />
  </StrictMode>,
);

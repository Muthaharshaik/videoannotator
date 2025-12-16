import { createElement } from "react";

export function preview({ sampleText }) {
    return <HelloWorldSample sampleText={sampleText} />;
}

export function getPreviewCss() {
    return require("./ui/Videoannotator.css");
}

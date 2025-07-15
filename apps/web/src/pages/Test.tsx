import React from "react";
import ExcalidrawPlayer from "../components/ExcalidrawPlayer";

const Test: React.FC = () => {
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border bg-card px-6 h-16 flex items-center">
        <div className="max-w-6xl mx-auto w-full">
          <h1 className="text-xl font-bold">Test Excalidraw Player (POC Style)</h1>
        </div>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-6xl">
          <ExcalidrawPlayer />
        </div>
      </div>
    </div>
  );
};

export default Test;
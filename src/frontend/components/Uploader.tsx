import { UploadCloud } from "lucide-react";
import React, { useState, useCallback } from "react";

export function Uploader() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    setUploading(true);
    let uploadedCount = 0;

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        await fetch("/api/batch/upload", {
          method: "POST",
          body: formData,
        });
        uploadedCount++;
        setProgress((uploadedCount / files.length) * 100);
      } catch (e) {
        console.error("Upload failed for file:", file.name, "Error:", JSON.stringify(e));
      }
    }

    setUploading(false);
    setFiles([]);
    setProgress(0);
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-gray-900 text-white rounded-lg shadow-lg">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="border-2 border-dashed border-gray-600 rounded-xl p-12 text-center w-full max-w-lg cursor-pointer hover:border-gray-400"
      >
        <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-4 text-lg">Drag & drop some files here, or click to select files</p>
        <input
          type="file"
          multiple
          className="hidden"
          id="file-upload"
          onChange={(e) => {
            if (e.target.files) {
              setFiles(Array.from(e.target.files));
            }
          }}
        />
        <label
          htmlFor="file-upload"
          className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
        >
          Select Files
        </label>
      </div>

      {files.length > 0 && (
        <div className="mt-8 w-full max-w-lg">
          <h3 className="text-xl font-semibold mb-4">Files to Upload</h3>
          <ul className="space-y-2 mb-4">
            {files.map((file, idx) => (
              <li key={idx} className="bg-gray-800 p-2 rounded flex justify-between">
                <span>{file.name}</span>
                <span className="text-gray-400">{(file.size / 1024).toFixed(2)} KB</span>
              </li>
            ))}
          </ul>

          <button
            onClick={uploadFiles}
            disabled={uploading}
            className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload All"}
          </button>

          {uploading && (
            <div className="mt-4 w-full bg-gray-700 rounded h-4 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: progress + "%" }}
              ></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

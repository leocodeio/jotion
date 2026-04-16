"use client";

import { useState } from "react";
import { uploadMediaFile } from "@/lib/local-media-client";
import { Button } from "@/components/ui/button";
import { ImageIcon } from "lucide-react";

interface EditorProps {
  onChange: (value: string) => void;
  initialContent?: string;
  editable?: boolean;
}

const Editor = ({ onChange, initialContent, editable }: EditorProps) => {
  const [value, setValue] = useState(initialContent ?? "");
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await uploadMediaFile(file);
      const nextValue = `${value}\n\n![${file.name}](${url})`.trim();
      setValue(nextValue);
      onChange(nextValue);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const onTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setValue(nextValue);
    onChange(nextValue);
  };

  return (
    <div className="space-y-3">
      {editable !== false && (
        <div className="flex items-center gap-2">
          <label htmlFor="editor-image-upload">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={isUploading}
              asChild
            >
              <span>
                <ImageIcon className="h-4 w-4 mr-2" />
                {isUploading ? "Uploading..." : "Insert image"}
              </span>
            </Button>
          </label>
          <input
            id="editor-image-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      )}
      <textarea
        value={value}
        onChange={onTextChange}
        readOnly={editable === false}
        className="w-full min-h-[420px] border border-input rounded-md bg-transparent p-3 text-base resize-y outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
};

export default Editor;

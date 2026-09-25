"use client";

import type { PhotoEstimation } from "@/lib/types/estimation";

interface Props {
  photos: PhotoEstimation[];
  onMajPhoto: (id: string, maj: Partial<PhotoEstimation>) => void;
}

export function PhotoLegende({ photos, onMajPhoto }: Props) {
  return (
    <div className="space-y-4 max-w-md">
      {photos.map((photo) => (
        <div key={photo.id} className="flex items-start gap-3">
          <span className="shrink-0 mt-2.5 bg-brass text-paper text-[0.65rem] w-5 h-5 flex items-center justify-center rounded-full font-medium">
            {photo.ordre}
          </span>
          <div className="flex-1">
            <input
              type="text"
              value={photo.legende ?? ""}
              maxLength={80}
              placeholder="Vue depuis la porte-fenêtre du salon"
              onChange={(e) =>
                onMajPhoto(photo.id, { legende: e.target.value })
              }
              className="w-full px-3 py-2 border border-hair-light rounded bg-white text-ink text-[0.9rem] placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-brass/50 focus:border-brass"
            />
            <p className="mt-0.5 text-[0.7rem] text-stone text-right">
              {(photo.legende ?? "").length}/80
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

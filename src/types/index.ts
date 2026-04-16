export interface Camera {
  id: number;
  img_name: string;
  width: number;
  height: number;
  position: [number, number, number];
  rotation: number[][];
  fy: number;
  fx: number;
}

export interface SplatViewerState {
  isLoading: boolean;
  progress: number;
  fps: number;
  vertexCount: number;
  currentCameraIndex: number;
}

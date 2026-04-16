import { useGaussianSplat } from '@/hooks/useGaussianSplat';
import { CubeSpinner } from './CubeSpinner';

export function GaussianSplatViewer() {
  const {
    canvasRef,
    isLoading,
    error,
    fps,
    vertexCount,
    totalSplats,
    animationPhase,
    animationProgress,
    carousel,
    setCarousel,
  } = useGaussianSplat();

  const getPhaseLabel = () => {
    switch (animationPhase) {
      case 'downloading': {
        // Show actual download progress based on vertexCount
        const downloadPct = totalSplats > 0 
          ? Math.round((vertexCount / totalSplats) * 100)
          : 0;
        return `Downloading ${downloadPct}%`;
      }
      case 'hold':
        return 'Processing...';
      case 'revealing':
        return `Revealing ${animationProgress}%`;
      default:
        return '';
    }
  };

  const getPhaseColor = () => {
    switch (animationPhase) {
      case 'downloading':
        return 'bg-blue-600';
      case 'hold':
        return 'bg-yellow-600';
      case 'revealing':
        // Green when complete, cyan during animation
        return animationProgress >= 100 ? 'bg-green-600' : 'bg-cyan-600';
      default:
        return 'bg-gray-600';
    }
  };

  if (error) {
    return (
      <div className="relative w-full h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white p-8">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Info Panel */}
      <div className="absolute top-3 left-4 z-50 text-white">
        <h3 className="text-lg font-semibold mb-1">WebGL 3D Gaussian Splat Viewer</h3>
        <p className="text-sm opacity-80">
          By{' '}
          <a
            href="https://twitter.com/antimatter15"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-400"
          >
            Kevin Kwok
          </a>
          . Code on{' '}
          <a
            href="https://github.com/antimatter15/splat"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-400"
          >
            Github
          </a>
        </p>

        <details className="mt-2 text-xs">
          <summary className="cursor-pointer hover:text-blue-400">
            Use mouse or arrow keys to navigate.
          </summary>
          <div className="bg-black/60 p-3 rounded-lg mt-2 whitespace-pre-wrap text-[10px] leading-relaxed">
{`movement (arrow keys)
- left/right arrow keys to strafe side to side
- up/down arrow keys to move forward/back
- space to jump

camera angle (wasd)
- a/d to turn camera left/right
- w/s to tilt camera up/down
- q/e to roll camera counterclockwise/clockwise
- i/k and j/l to orbit

trackpad
- scroll up/down/left/right to orbit
- pinch to move forward/back
- ctrl key + scroll to move forward/back
- shift + scroll to move up/down or strafe

mouse
- click and drag to orbit
- right click (or ctrl/cmd key) and drag up/down to move

touch (mobile)
- one finger to orbit
- two finger pinch to move forward/back
- two finger rotate to rotate camera clockwise/counterclockwise
- two finger pan to move side-to-side and up-down

gamepad
- if you have a game controller connected it should work

other
- press p to resume default animation`}
          </div>
        </details>
      </div>

      {/* Progress Bar - shows actual download progress, hides when complete */}
      {(isLoading || animationProgress < 100) && (
        <div
          className="absolute top-0 left-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 z-50 transition-all duration-100"
          style={{ 
            width: animationPhase === 'downloading' 
              ? `${totalSplats > 0 ? (vertexCount / totalSplats) * 100 : 0}%`
              : `${animationProgress}%`
          }}
        />
      )}

      {/* Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <CubeSpinner />
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
      />

      {/* Stats */}
      <div className="absolute bottom-3 right-4 z-50 text-white text-sm">
        <span className="font-mono">{fps} fps</span>
        {vertexCount > 0 && (
          <span className="ml-4 font-mono text-xs opacity-70">
            {vertexCount.toLocaleString()} / {totalSplats.toLocaleString()} splats
          </span>
        )}
      </div>

      {/* Animation Phase */}
      <div className="absolute top-3 right-4 z-50 text-white text-sm">
        <span className={`font-mono px-2 py-1 rounded ${getPhaseColor()}`}>
          {getPhaseLabel()}
        </span>
      </div>

      {/* Controls */}
      <div className="absolute bottom-3 left-4 z-50 flex gap-2">
        <button
          type="button"
          onClick={() => setCarousel(!carousel)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            carousel
              ? 'bg-blue-600 text-white'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          {carousel ? 'Stop Animation' : 'Play Animation'}
        </button>
      </div>
    </div>
  );
}

export function CubeSpinner() {
  return (
    <div className="cube-wrapper" style={{ transformStyle: 'preserve-3d', perspective: '800px' }}>
      <div
        className="cube"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(45deg) rotateZ(45deg)',
          animation: 'rotation 2s infinite',
        }}
      >
        <div
          className="cube-faces"
          style={{
            transformStyle: 'preserve-3d',
            height: '80px',
            width: '80px',
            position: 'relative',
            transformOrigin: '0 0',
            transform: 'translateX(0) translateY(0) translateZ(-40px)',
          }}
        >
          <div
            className="cube-face"
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0017ff',
              border: 'solid 1px #ffffff',
            }}
          />
          <div
            className="cube-face top"
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0017ff',
              border: 'solid 1px #ffffff',
              transform: 'translateZ(80px)',
            }}
          />
          <div
            className="cube-face front"
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0017ff',
              border: 'solid 1px #ffffff',
              transformOrigin: '0 50%',
              transform: 'rotateY(-90deg)',
            }}
          />
          <div
            className="cube-face back"
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0017ff',
              border: 'solid 1px #ffffff',
              transformOrigin: '0 50%',
              transform: 'rotateY(-90deg) translateZ(-80px)',
            }}
          />
          <div
            className="cube-face right"
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0017ff',
              border: 'solid 1px #ffffff',
              transformOrigin: '50% 0',
              transform: 'rotateX(-90deg) translateY(-80px)',
            }}
          />
          <div
            className="cube-face left"
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0017ff',
              border: 'solid 1px #ffffff',
              transformOrigin: '50% 0',
              transform: 'rotateX(-90deg) translateY(-80px) translateZ(80px)',
            }}
          />
        </div>
      </div>
      <style>{`
        @keyframes rotation {
          0% {
            transform: rotateX(45deg) rotateY(0) rotateZ(45deg);
            animation-timing-function: cubic-bezier(0.17, 0.84, 0.44, 1);
          }
          50% {
            transform: rotateX(45deg) rotateY(0) rotateZ(225deg);
            animation-timing-function: cubic-bezier(0.76, 0.05, 0.86, 0.06);
          }
          100% {
            transform: rotateX(45deg) rotateY(0) rotateZ(405deg);
            animation-timing-function: cubic-bezier(0.17, 0.84, 0.44, 1);
          }
        }
      `}</style>
    </div>
  );
}

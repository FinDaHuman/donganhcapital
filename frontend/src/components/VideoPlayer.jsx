import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

const VideoPlayer = ({ src }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        let hls;

        if (Hls.isSupported() && videoRef.current) {
            hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoRef.current.play().catch(e => console.log("Autoplay prevented", e));
            });
        } else if (videoRef.current && videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // For Safari which has native HLS support
            videoRef.current.src = src;
            videoRef.current.addEventListener('loadedmetadata', () => {
                videoRef.current.play().catch(e => console.log("Autoplay prevented", e));
            });
        }

        return () => {
            if (hls) {
                hls.destroy();
            }
        };
    }, [src]);

    return (
        <div
            className="absolute w-full h-[80vh] overflow-hidden flex justify-center items-center pointer-events-none z-0 bg-transparent"
            style={{ bottom: '35vh' }}
        >
            <video
                ref={videoRef}
                className="min-w-full min-h-full object-cover opacity-100 mix-blend-screen"
                autoPlay
                loop
                muted
                playsInline
            />
        </div>
    );
};

export default React.memo(VideoPlayer);

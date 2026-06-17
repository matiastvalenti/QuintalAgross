import React from 'react';
import s from './LoadingScreen.module.css';

const LoadingScreen = ({ message = "Cargando..." }) => {
    return (
        <div className={s.overlay}>
            <div className={s.container}>
                <div className={s.logoWrapper}>
                    <div className={s.outerRing}></div>
                    <div className={s.innerRing}></div>
                    <div className={s.logoText}>Q</div>
                </div>
                <div className={s.textWrapper}>
                    <h2 className={s.brand}>
                        Quintal<span>.</span>
                    </h2>
                    <p className={s.status}>{message}</p>
                </div>
                <div className={s.progressTrack}>
                    <div className={s.progressBar}></div>
                </div>
            </div>
        </div>
    );
};

export default LoadingScreen;

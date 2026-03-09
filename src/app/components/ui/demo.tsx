"use client"

import { useState } from "react"
import { MeshGradient, DotOrbit } from "@paper-design/shaders-react"
import { Copy, Check } from "lucide-react"

interface DemoOneProps {
    className?: string; // allow overriding className to use in WelcomeScreen
}

export default function DemoOne({ className }: DemoOneProps) {
    const [intensity, setIntensity] = useState(1.5)
    const [speed, setSpeed] = useState(1.0)
    // const [isInteracting, setIsInteracting] = useState(false)
    const [activeEffect, setActiveEffect] = useState("mesh")
    const [copied, setCopied] = useState(false)

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText("pnpm i 21st")
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error("Failed to copy text: ", err)
        }
    }

    return (
        <div className={`w-full h-full bg-black relative overflow-hidden ${className || ''}`}>
            {activeEffect === "mesh" && (
                <MeshGradient
                    className="w-full h-full absolute inset-0"
                    colors={["#000000", "#1a1a1a", "#333333", "#ffffff"]}
                    speed={speed}
                    backgroundColor="#000000"
                />
            )}

            {activeEffect === "dots" && (
                <div className="w-full h-full absolute inset-0 bg-black">
                    <DotOrbit
                        className="w-full h-full"
                        dotColor="#333333"
                        orbitColor="#1a1a1a"
                        speed={speed}
                        intensity={intensity}
                    />
                </div>
            )}

            {activeEffect === "combined" && (
                <>
                    <MeshGradient
                        className="w-full h-full absolute inset-0"
                        colors={["#000000", "#1a1a1a", "#333333", "#ffffff"]}
                        speed={speed * 0.5}
                        wireframe={true}
                        backgroundColor="#000000"
                    />
                    <div className="w-full h-full absolute inset-0 opacity-60">
                        <DotOrbit
                            className="w-full h-full"
                            dotColor="#333333"
                            orbitColor="#1a1a1a"
                            speed={speed * 1.5}
                            intensity={intensity * 0.8}
                        />
                    </div>
                </>
            )}

            {/* Lighting overlay effects */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div
                    className="absolute top-1/4 left-1/3 w-32 h-32 bg-gray-800/5 rounded-full blur-3xl animate-pulse"
                    style={{ animationDuration: `${3 / speed}s` }}
                />
                <div
                    className="absolute bottom-1/3 right-1/4 w-24 h-24 bg-white/2 rounded-full blur-2xl animate-pulse"
                    style={{ animationDuration: `${2 / speed}s`, animationDelay: "1s" }}
                />
                <div
                    className="absolute top-1/2 right-1/3 w-20 h-20 bg-gray-900/3 rounded-full blur-xl animate-pulse"
                    style={{ animationDuration: `${4 / speed}s`, animationDelay: "0.5s" }}
                />
            </div>

            {/* 
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="text-center font-mono text-xs text-white/40">
          <div>...21st-cli...</div>
          <div className="mt-1 flex items-center gap-2">
            <span>pnpm i 21st.dev</span>
            <button
              onClick={copyToClipboard}
              className="pointer-events-auto opacity-30 hover:opacity-60 transition-opacity text-white/60 hover:text-white/80"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check size={12} />
              ) : (
                <Copy size={12} />
              )}
            </button>
          </div>
        </div>
      </div>
      */}
        </div>
    )
}

import { useEffect, useRef } from "react";
import { Chess } from "chess.js";

export function useStockfish(engineFile = "stockfish-nnue-16-single.js") {
  const engineRef = useRef<Worker | null>(null);

  useEffect(() => {
    engineRef.current = new Worker(`/${engineFile}`);
    engineRef.current.postMessage("uci");

    return () => {
      if (engineRef.current) {
        engineRef.current.terminate();
        engineRef.current = null;
      }
    };
  }, [engineFile]);

  const getBestMove = (fen: string, depth = 25): Promise<string> => {
    return new Promise((resolve) => {
      if (!engineRef.current) throw new Error("Engine not initialized");

      const handleMessage = (event: MessageEvent) => {
        const data = event.data;
        if (typeof data === "string" && data.startsWith("bestmove")) {
          engineRef.current?.removeEventListener("message", handleMessage);
          const move = data.split(" ")[1];
          resolve(move);
        }
      };

      engineRef.current.addEventListener("message", handleMessage);
      engineRef.current.postMessage("ucinewgame");
      engineRef.current.postMessage(`position fen ${fen}`);
      engineRef.current.postMessage(`go depth ${depth}`);
    });
  };

  const evaluateAllMoves = async (
    fen: string,
    depth = 25
  ): Promise<Record<string, { square: string; score: number }[]>> => {
    if (!engineRef.current) throw new Error("Engine not initialized");

    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });

    const results: Record<string, { square: string; score: number }[]> = {};

    const evaluatePosition = (fenToEval: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const engine = engineRef.current!;
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            engine.removeEventListener("message", onMessage);
            reject(new Error("Evaluation timeout"));
          }
        }, 30000);

        const onMessage = (msg: MessageEvent) => {
          const data = msg.data;

          if (typeof data === "string") {
            const match = data.match(/score (cp|mate) (-?\d+)/);
            if (match && !resolved) {
              resolved = true;
              clearTimeout(timeout);
              const [, type, val] = match;
              let score = parseInt(val, 10);
              if (type === "mate") score = score > 0 ? 100000 : -100000;

              score = score / 100;
              engine.removeEventListener("message", onMessage);
              resolve(-score); // Invert so it's always from White's perspective
            }

            if (data.startsWith("bestmove") && !resolved) {
              resolved = true;
              clearTimeout(timeout);
              engine.removeEventListener("message", onMessage);
              resolve(0);
            }
          }
        };

        engine.addEventListener("message", onMessage);
        engine.postMessage("ucinewgame");
        engine.postMessage(`position fen ${fenToEval}`);
        engine.postMessage(`go depth ${depth}`);
      });
    };

    // Step 1: Evaluate initial position
    const initialScore = await evaluatePosition(fen);

    for (const move of moves) {
      const from = move.from;
      const to = move.to;

      const gameCopy = new Chess(fen);
      const moveResult = gameCopy.move({ from, to, promotion: "q" });

      if (!moveResult) continue;

      const newFen = gameCopy.fen();

      try {
        const newScore = await evaluatePosition(newFen);

        // Calculate score difference
        const scoreDiff = newScore - initialScore;

        if (!results[from]) results[from] = [];
        results[from].push({ square: to, score: scoreDiff });
      } catch {
        // Skip errors silently
      }
    }

    // Find overall best move by score difference
    let overallBestScore = -Infinity;
    let overallBestFrom = "";
    let overallBestTo = "";
    let overallBestFen = "";

    for (const [from, moves] of Object.entries(results)) {
      for (const { square: to, score } of moves) {
        if (score > overallBestScore) {
          overallBestScore = score;
          overallBestFrom = from;
          overallBestTo = to;

          const gameCopy = new Chess(fen);
          gameCopy.move({ from, to, promotion: "q" });
          overallBestFen = gameCopy.fen();
        }
      }
    }

    console.log(`✅ Current FEN: ${fen}`);
    console.log(`✅ Best move: ${overallBestFrom} → ${overallBestTo}`);
    console.log(`✅ Score difference for best move: ${overallBestScore}`);
    console.log(`✅ Best move FEN: ${overallBestFen}`);

    return results;
  };

  return {
    getBestMove,
    evaluateAllMoves,
  };
}

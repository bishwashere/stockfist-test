// src/hooks/useStockfish.ts
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

  // Get best move from Stockfish for a given position
  const getBestMove = (fen: string, depth = 12): Promise<string> => {
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

  // Evaluate all possible moves from current fen with score
  // Returns object: { [fromSquare]: [{ square: toSquare, score: number }] }
  const evaluateAllMoves = async (
    fen: string,
    depth = 31
  ): Promise<Record<string, { square: string; score: number }[]>> => {
    if (!engineRef.current) throw new Error("Engine not initialized");

    console.log("[evaluateAllMoves] Starting with FEN:", fen);

    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });

    console.log("[evaluateAllMoves] Total legal moves:", moves.length);

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
        }, 10000); // 10 second timeout

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

              engine.removeEventListener("message", onMessage);
              engine.postMessage("stop");
              resolve(score);
            }

            if (data.startsWith("bestmove") && !resolved) {
              resolved = true;
              clearTimeout(timeout);
              engine.removeEventListener("message", onMessage);
              resolve(0); // Default score if no evaluation found
            }
          }
        };

        engine.addEventListener("message", onMessage);
        engine.postMessage("ucinewgame");
        engine.postMessage(`position fen ${fenToEval}`);
        engine.postMessage(`go depth ${depth}`);
      });
    };

    // Process all moves sequentially and wait for each to complete
    let processedCount = 0;
    for (const move of moves) {
      const from = move.from;
      const to = move.to;

      const gameCopy = new Chess(fen);
      const moveResult = gameCopy.move({ from, to, promotion: "q" });

      if (!moveResult) {
        console.warn(
          `[evaluateAllMoves] ❌ Invalid move skipped: ${from} → ${to}`
        );
        continue;
      }

      const newFen = gameCopy.fen();
      console.log(
        `[evaluateAllMoves] Trying move: ${from} → ${to} (${
          processedCount + 1
        }/${moves.length})`
      );

      try {
        const score = await evaluatePosition(newFen);
        console.log(
          `[evaluateAllMoves] ✅ Score for ${from} → ${to}: ${score}`
        );

        if (!results[from]) results[from] = [];
        results[from].push({ square: to, score });
        processedCount++;
      } catch (error) {
        console.error(
          `[evaluateAllMoves] ❌ Error evaluating ${from} → ${to}:`,
          error
        );
      }
    }

    console.log(
      `[evaluateAllMoves] 🎉 ALL EVALUATIONS COMPLETE! Processed ${processedCount} moves.`
    );
    console.log(
      "[evaluateAllMoves] ✅ Final Evaluated Moves:\n",
      JSON.stringify(results, null, 2)
    );

    return results;
  };

  return {
    getBestMove,
    evaluateAllMoves,
  };
}

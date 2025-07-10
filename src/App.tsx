import React, { useEffect, useRef, useState } from 'react'
import { Chess, type Square } from "chess.js"
import { Chessboard, type PieceDropHandlerArgs } from 'react-chessboard';
import { useStockfish } from './hooks/useStockfish';
const App = () => {
  // create a chess game using a ref to always have access to the latest game state within closures and maintain the game state across renders
  const chessGameRef = useRef(new Chess("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"));
  const chessGame = chessGameRef.current;
  const [moveableSquares, setMoveableSquares] = useState<Record<Square, Square[]>>({});

  // State to store move evaluations from evaluateAllMoves
  const [moveEvaluations, setMoveEvaluations] = useState<Record<string, Array<{ square: string, score: number }>>>({});

  // State to track selected piece for showing move scores
  const [selectedPiece, setSelectedPiece] = useState<Square | null>(null);
  const { evaluateAllMoves, getBestMove } = useStockfish();
  // track the current position of the chess game in state to trigger a re-render of the chessboard
  const [chessPosition, setChessPosition] = useState(chessGame.fen());

  // handle piece drop
  function onPieceDrop({
    sourceSquare,
    targetSquare
  }: PieceDropHandlerArgs) {
    // type narrow targetSquare potentially being null (e.g. if dropped off board)
    if (!targetSquare) {
      return false;
    }

    // try to make the move according to chess.js logic
    try {
      chessGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q' // always promote to a queen for example simplicity
      });

      // update the position state upon successful move to trigger a re-render of the chessboard
      setChessPosition(chessGame.fen());

      // make random cpu move after a short delay

      // return true as the move was successful
      return true;
    } catch {
      // return false as the move was not successful
      return false;
    }
  }

  /**
   * Handle square click to select piece and show move scores
   */
  const onSquareClick = (squareData: any) => {
//     console.log('Square clicked:', squareData);

    /** Extract square string from the click data */
    const square = typeof squareData === 'string' ? squareData : squareData?.square;

//     console.log('Extracted square:', square);
//     console.log('moveableSquares:', moveableSquares);
//     console.log('Current selectedPiece:', selectedPiece);

    if (square && moveableSquares[square as Square] && moveableSquares[square as Square].length > 0) {
      const newSelectedPiece = selectedPiece === square ? null : (square as Square);
//       console.log('Setting selectedPiece to:', newSelectedPiece);
      setSelectedPiece(newSelectedPiece);
    } else {
      console.log('Square has no moveable pieces, clearing selection');
      setSelectedPiece(null);
    }
  };

  /**
   * Generate square styles to highlight squares with moveable pieces and show scores
   */
  const getSquareStyles = () => {
    const styles: Record<Square, React.CSSProperties> = {};

    // Highlight moveable pieces
    Object.keys(moveableSquares).forEach((square) => {
      if (moveableSquares[square as Square].length > 0) {
        styles[square as Square] = {
          backgroundColor: selectedPiece === square ? 'rgba(255, 0, 0, 0.6)' : 'rgba(255, 0, 0, 0.3)'
        };
      }
    });

    // Show scores for selected piece's possible moves
    if (selectedPiece && moveEvaluations[selectedPiece]) {
      moveEvaluations[selectedPiece].forEach(({ square: targetSquare, score }) => {
        styles[targetSquare as Square] = {
          ...styles[targetSquare as Square],
          backgroundColor: 'rgba(0, 255, 0, 0.4)',
          position: 'relative'
        };
      });
    }

    return styles;
  };

  /**
   * Generate score overlay grid
   */
  const renderScoreOverlay = () => {
//     console.log('renderScoreOverlay called - selectedPiece:', selectedPiece);
//     console.log('moveEvaluations:', moveEvaluations);

    const squares = [];
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    if (!selectedPiece) {
      /** Prepare all best scores per piece */
      const pieceBestMoves: { pieceSquare: string; score: number }[] = [];

      Object.keys(moveEvaluations).forEach(pieceSquare => {
        const moves = moveEvaluations[pieceSquare];
        if (moves && moves.length > 0) {
          const bestScore = Math.max(...moves.map(m => m.score));
          pieceBestMoves.push({ pieceSquare, score: bestScore });
        }
      });

      /** Find overall best piece */
      const overallBestScore = Math.max(...pieceBestMoves.map(p => p.score));

      pieceBestMoves.forEach(({ pieceSquare, score }) => {
        const file = files.indexOf(pieceSquare[0]);
        const rank = ranks.indexOf(pieceSquare[1]);

        if (file !== -1 && rank !== -1) {
          const isOverallBest = score === overallBestScore;

          squares.push(
            <div
              key={`best-${pieceSquare}`}
              style={{
                position: 'absolute',
                left: `${file * 12.5}%`,
                top: `${rank * 12.5}%`,
                width: '12.5%',
                height: '12.5%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 1000
              }}
            >
              <div
                style={{
                  backgroundColor: isOverallBest ? 'blue' : 'rgba(0, 100, 0, 0.9)',
                  color: 'white',
                  fontSize: '10px',
                  padding: '1px 3px',
                  borderRadius: '3px',
                  fontWeight: 'bold',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}
              >
                {score.toFixed(2)}
              </div>
            </div>
          );
        }
      });
    }
 else {
      /** Show all move scores for selected piece */
//       console.log('Piece selected - showing all moves for:', selectedPiece);

      if (moveEvaluations[selectedPiece]) {
        const moves = moveEvaluations[selectedPiece];

        // Find best score
        const bestScore = Math.max(...moves.map(m => m.score));

        moves.forEach(({ square: targetSquare, score }) => {
          const file = files.indexOf(targetSquare[0]);
          const rank = ranks.indexOf(targetSquare[1]);

          if (file !== -1 && rank !== -1) {
            // Check if this move is the best move
            const isBest = score === bestScore;

            squares.push(
              <div
                key={`move-${targetSquare}`}
                style={{
                  position: 'absolute',
                  left: `${file * 12.5}%`,
                  top: `${rank * 12.5}%`,
                  width: '12.5%',
                  height: '12.5%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  zIndex: 1000
                }}
              >
                <div
                  style={{
                    backgroundColor: isBest ? 'blue' : 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    fontSize: '12px',
                    padding: '2px 4px',
                    borderRadius: '3px',
                    fontWeight: 'bold'
                  }}
                >
                  {score.toFixed(2)}
                </div>
              </div>
            );
          }
        });
      }

    }

    return (
      <div
        id="score-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1000
        }}
      >
        {squares}
      </div>
    );
  };

  // set the chessboard options
  const chessboardOptions = {
    position: chessPosition,
    onPieceDrop,
    onSquareClick,
    id: 'play-vs-random',
    squareStyles: getSquareStyles()
  };

  /**
   * Check if game is over and show result alert
   */
  const checkGameOver = () => {
    if (chessGame.isGameOver()) {
      if (chessGame.isCheckmate()) {
        const winner = chessGame.turn() === 'w' ? 'black' : 'white';
        if (winner === 'white') {
          alert('You won!');
        } else {
          alert('You lose!');
        }
      } else if (chessGame.isDraw()) {
        alert('Game ended in a draw!');
      }
    }
  };

  const fen = chessGame.fen()

  useEffect(() => {

//     console.log("fen:", fen)

    const fn = async () => {
      const moves = await evaluateAllMoves(chessGame.fen());
      console.log("moves", moves);

      // Store the move evaluations in state
      setMoveEvaluations(moves);

      const bestMove = await getBestMove(fen);
//       console.log("best move:", bestMove);
    }

    fn();

    /** Check for game over after each move */
    checkGameOver();

    /** Calculate moveable squares for current player */
    const allMoves = chessGame.moves({ verbose: true });  // all legal moves for current player
    const currentPlayerMovableSquares: Record<Square, Square[]> = {};

    for (const move of allMoves) {
      const from = move.from;
      if (!currentPlayerMovableSquares[from]) {
        currentPlayerMovableSquares[from] = [];
      }
      currentPlayerMovableSquares[from].push(move.to);
    }

    setMoveableSquares(currentPlayerMovableSquares);
//     console.log(`${chessGame.turn() === 'w' ? 'White' : 'Black'}'s movable pieces and destinations:`, currentPlayerMovableSquares);
  }, [fen]);

  // render the chessboard
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-2xl aspect-square" style={{ position: 'relative' }}>
        <Chessboard options={chessboardOptions} />
        {renderScoreOverlay()}
      </div>
    </div>
  );

}

export default App
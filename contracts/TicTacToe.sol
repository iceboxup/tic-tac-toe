// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @notice TicTacToe is a solidity implementation of the tic-tac-toe game.
/// @dev you can refer the rules at https://en.wikipedia.org/wiki/Tic-tac-toe
contract TicTacToe is ReentrancyGuard {
    using SafeERC20 for IERC20;

    event NewGame(address host, uint256 gameId);
    event JoinGame(address joiner, uint256 gameId);
    event Play(address player, uint256 gameId, uint256 x, uint256 y);
    event Withdraw(address player, uint256 gameId);

    address constant ETH = address(0);
    uint256 constant NO_REPLY_LIMIT = 1 days;

    struct Game {
        address player1;
        address player2;
        address token;
        uint256 amount;
        uint16 winner; // 0: none, 1: player1, 2: player2, 3: drawn
        uint16 turn; // 0: none, 1: player1, 2: player2
        uint16[3][3] board; // 0: none, 1: player1, 2: player2
        uint256 lastUpdate;
    }

    mapping(uint256 => Game) public games;
    uint256 public gameCount;

    /// @notice host can create a new game
    /// @dev host needs to deposit ETH/Token
    /// @param token the token address. address(0) means ETH
    /// @param amount the amount of ETH/token
    function createNewGame(address token, uint256 amount)
        external
        payable
        returns (uint256 gameId)
    {
        if (token == ETH) {
            require(amount == msg.value, "TTT_INVALID_AMOUNT");
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        Game memory game;
        game.player1 = msg.sender;
        game.token = token;
        game.amount = amount;
        game.lastUpdate = block.timestamp;

        gameCount++;
        games[gameCount] = game;

        emit NewGame(msg.sender, gameCount);
        return gameCount;
    }

    /// @notice joiner can join the game
    /// @dev joiner needs to deposit the same amount of ETH/Token
    /// @param gameId the game id to join
    function joinGame(uint256 gameId) external payable {
        require(gameId > 0 && gameId <= gameCount, "TTT_INVALID_GAME_ID");

        Game storage game = games[gameId];
        require(game.player2 == address(0), "TTT_ALREADY_STARTED");

        if (game.token == ETH) {
            require(game.amount == msg.value, "TTT_INVALID_AMOUNT");
        } else {
            IERC20(game.token).safeTransferFrom(
                msg.sender,
                address(this),
                game.amount
            );
        }

        game.player2 = msg.sender;
        game.turn = 1;
        game.lastUpdate = block.timestamp;

        emit JoinGame(msg.sender, gameId);
    }

    /// @notice players can play the game
    /// @param gameId the game id to play
    /// @param x x coordinate, 0 ~ 2
    /// @param y y coordinate, 0 ~ 2
    function play(
        uint256 gameId,
        uint16 x,
        uint16 y
    ) external nonReentrant {
        require(gameId > 0 && gameId <= gameCount, "TTT_INVALID_GAME_ID");
        require(x < 3 && y < 3, "TTT_INVALID_COORDINATE");

        Game storage game = games[gameId];
        require(game.winner == 0, "TTT_ALREADY_ENDED");
        require(game.player2 != address(0), "TTT_NOT_STARTED");
        require(
            (game.turn == 1 && msg.sender == game.player1) ||
                (game.turn == 2 && msg.sender == game.player2),
            "TTT_NOT_YOUR_TURN"
        );
        require(game.board[x][y] == 0, "TTT_EXIST_COORDINATE");

        game.board[x][y] = game.turn;
        game.lastUpdate = block.timestamp;

        uint16 winner = _calculateWinner(game.board, x, y);

        if (winner == 0) {
            game.turn = (game.turn == 1 ? 2 : 1);
        } else {
            game.turn = 0;
            game.winner = winner;

            uint256 amount1;
            uint256 amount2;

            if (winner == 1) {
                amount1 = game.amount * 2;
            } else if (winner == 2) {
                amount2 = game.amount * 2;
            } else if (winner == 3) {
                amount1 = game.amount;
                amount2 = game.amount;
            }

            if (amount1 != 0) {
                _uniTransfer(game.player1, game.token, amount1);
            }
            if (amount2 != 0) {
                _uniTransfer(game.player2, game.token, amount2);
            }
        }

        emit Play(msg.sender, gameId, x, y);
    }

    /// @notice if the player doesn't play for a certain period (e.g. 1 day), the opposite can withdarw the locked funds.
    /// @param gameId the game id to withdraw
    function withdraw(uint256 gameId) external nonReentrant {
        require(gameId > 0 && gameId <= gameCount, "TTT_INVALID_GAME_ID");

        Game storage game = games[gameId];
        require(game.winner == 0, "TTT_ALREADY_ENDED");
        require(
            (game.turn != 1 && msg.sender == game.player1) ||
                (game.turn != 2 && msg.sender == game.player2),
            "TTT_YOUR_TURN"
        );
        require(
            game.lastUpdate + NO_REPLY_LIMIT <= block.timestamp,
            "TTT_NOT_WITHDRAWABLE"
        );

        game.turn = 0; // none
        game.winner = 3; // drawn
        game.lastUpdate = block.timestamp;

        if (game.player2 == address(0)) {
            _uniTransfer(msg.sender, game.token, game.amount);
        } else {
            _uniTransfer(msg.sender, game.token, game.amount * 2);
        }
    }

    /* Internal Functions */

    /// @notice transfer ETH/token
    /// @dev address(0) means ETH
    /// @param to the destination address
    /// @param token the token address. address(0) means ETH
    /// @param amount the amount of ETH/token
    function _uniTransfer(
        address to,
        address token,
        uint256 amount
    ) internal {
        if (token == ETH) {
            payable(to).transfer(amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @notice calculate the winner from the board
    /// @dev if we know the last player's coordinate, we can calculate the winner
    /// @param board the board status, 0: none, 1: player1, 2: player2
    /// @param curX x coordinate where the last player used
    /// @param curY y coordinate where the last player used
    /// @return winner the winner, 0: none, 1: player1, 2: player2, 3: drawn
    function _calculateWinner(
        uint16[3][3] memory board,
        uint16 curX,
        uint16 curY
    ) internal pure returns (uint16 winner) {
        // check row
        if (
            board[curX][0] != 0 &&
            board[curX][0] == board[curX][1] &&
            board[curX][1] == board[curX][2]
        ) {
            return board[curX][0];
        }

        // check column
        if (
            board[0][curY] != 0 &&
            board[0][curY] == board[1][curY] &&
            board[1][curY] == board[2][curY]
        ) {
            return board[0][curY];
        }

        // check diagonal
        if (
            curX == curY &&
            board[0][0] != 0 &&
            board[0][0] == board[1][1] &&
            board[1][1] == board[2][2]
        ) {
            return board[0][0];
        }
        if (
            curX + curY == 2 &&
            board[0][2] != 0 &&
            board[0][2] == board[1][1] &&
            board[1][1] == board[2][0]
        ) {
            return board[0][2];
        }

        // check is full
        for (uint16 i = 0; i < 3; i++) {
            for (uint16 j = 0; j < 3; j++) {
                if (board[i][j] == 0) {
                    return 0;
                }
            }
        }

        return 3;
    }
}

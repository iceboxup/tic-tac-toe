// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract TestToken is ERC20 {
    using SafeMath for uint256;

    constructor(uint256 totalSupply) ERC20("Test Token", "test") {
        _mint(msg.sender, totalSupply.mul(10**uint256(decimals())));
    }
}
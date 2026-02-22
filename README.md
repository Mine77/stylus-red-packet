// requirements
- rust toolchain (rustc rustup cargo)


// new stylus project
cargo stylus new <YOUR_PROJECT_NAME>

//check
cargo stylus check --endpoint https://sepolia-rollup.arbitrum.io/rpc

//estimate gas
cargo stylus deploy --endpoint https://sepolia-rollup.arbitrum.io/rpc -private-key="0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659" --estimate-gas

// deploy
cargo stylus deploy \
  --endpoint='https://sepolia-rollup.arbitrum.io/rpc' \
  --private-key="0xba2ccac676bd63eaa8c4bac8f4186b65edb4340e0ed767236ca4d81cf66b7a09" 

// verify
cargo stylus verify \
--contract hello-world \
    --endpoint https://sepolia-rollup.arbitrum.io/rpc \
    --deployment-tx 0x3417428f8b834f5a38c82f41d5d66bcc677a03acfb04d4459066029d790acebc \
    --no-verify


// export ABI to JSON
cargo stylus export-abi --output ./abi.json --json

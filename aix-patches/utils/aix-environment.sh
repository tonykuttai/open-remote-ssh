#!/bin/bash
# aix-patches/utils/aix-environment.sh
# AIX environment setup and validation

# Setup portlibforaix library dependencies
setup_portlibforaix() {
    echo "Setting up portlibforaix library dependencies..."
    
    local install_dir="$HOME/local/portlibforaix"
    local lib_file="$install_dir/lib/libutil.so.2"
    
    # Check if already installed
    if [[ -f "$lib_file" ]]; then
        echo "portlibforaix already installed at $install_dir"
        echo "   libutil.so.2: $(ls -la "$lib_file")"
        return 0
    fi
    
    echo "Installing portlibforaix dependencies for node-pty..."
    
    # Create temporary build directory
    local temp_dir="/tmp/portlibforaix-build-$$"
    mkdir -p "$temp_dir"
    
    # Cleanup function for this setup
    local cleanup_portlib() {
        echo "Cleaning up portlibforaix build directory..."
        rm -rf "$temp_dir" 2>/dev/null || true
    }
    trap cleanup_portlib EXIT
    
    cd "$temp_dir"
    
    # Clone the repository
    echo "Cloning portlibforaix repository..."
    if ! git clone https://github.com/tonykuttai/portlibforaix.git .; then
        echo " Failed to clone portlibforaix repository"
        echo "   Please check internet connectivity and GitHub access"
        return 1
    fi
    
    echo "Repository cloned successfully"
    
    # Show what we're building
    echo "=== PORTLIBFORAIX BUILD INFO ==="
    echo "Repository info:"
    git log --oneline -3 2>/dev/null || echo "No git log available"
    echo "Files in directory:"
    ls -la
    echo "================================"
    
    # Build and install
    echo "Building portlibforaix..."
    if ! make; then
        echo " portlibforaix build failed"
        echo "Build output in: $temp_dir"
        echo "Please check build dependencies and try manually:"
        echo "  cd $temp_dir"
        echo "  make"
        echo "  make install"
        return 1
    fi
    
    echo "Installing portlibforaix to $install_dir..."
    if ! make install; then
        echo " portlibforaix install failed"
        echo "Please check permissions and try manually:"
        echo "  cd $temp_dir" 
        echo "  make install"
        return 1
    fi
    
    # Verify installation
    if [[ -f "$lib_file" ]]; then
        echo "portlibforaix installed successfully"
        echo "   Installation directory: $install_dir"
        echo "   libutil.so.2: $(ls -la "$lib_file")"
        echo "   Library info: $(file "$lib_file")"
        
        # Test library loading
        if ! ldd "$lib_file" >/dev/null 2>&1; then
            echo "  Warning: libutil.so.2 may have dependency issues"
            echo "   This might cause runtime problems with node-pty"
        else
            echo "Library dependencies look good"
        fi
        
        return 0
    else
        echo " Installation verification failed - libutil.so.2 not found"
        echo "Expected: $lib_file"
        echo "Installed files:"
        find "$install_dir" -name "*.so*" 2>/dev/null || echo "No shared libraries found"
        return 1
    fi
}

# Setup AIX build environment
setup_aix_environment() {
    echo "Setting up AIX build environment..."
    
    # Set AIX-specific compiler flags for TLS compatibility
    export CXXFLAGS="-ftls-model=global-dynamic -fPIC -pthread"
    export CFLAGS="-ftls-model=global-dynamic -fPIC -pthread"
    
    # Ensure freeware tools are in PATH
    export PATH="/opt/freeware/bin:/opt/nodejs/bin:$PATH"
    
    # Set npm configuration for AIX
    export npm_config_target_arch=ppc64
    export npm_config_target_platform=aix
    export npm_config_build_from_source=true
    export npm_config_cache=/tmp/.npm-aix
    
    # Create npm cache directory
    mkdir -p /tmp/.npm-aix
    
    echo "Environment variables set:"
    echo "  CXXFLAGS: $CXXFLAGS"
    echo "  CFLAGS: $CFLAGS"
    echo "  PATH: $PATH"
    
    # Validate build tools
    if ! validate_build_tools; then
        return 1
    fi

    # Setup portlibforaix dependencies
    if ! setup_portlibforaix; then
        echo "   portlibforaix setup failed"
        echo "   This is required for node-pty builds"
        echo "   You may need to install it manually from https://github.com/tonykuttai/portlibforaix"
        return 1
    fi
    
    
    echo "AIX build environment ready"
    return 0
}

# Validate required build tools
validate_build_tools() {
    local missing_tools=()
    
    # Check essential tools
    command -v git >/dev/null 2>&1 || missing_tools+=("git")
    command -v node >/dev/null 2>&1 || missing_tools+=("node")
    command -v npm >/dev/null 2>&1 || missing_tools+=("npm")
    command -v gcc >/dev/null 2>&1 || command -v xlc >/dev/null 2>&1 || missing_tools+=("gcc/xlc")
    command -v make >/dev/null 2>&1 || command -v gmake >/dev/null 2>&1 || missing_tools+=("make/gmake")
    command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || missing_tools+=("python")
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        echo " Missing required tools: ${missing_tools[*]}"
        echo ""
        echo "Please install missing tools:"
        echo "  yum install git gcc gcc-c++ make python3"
        echo "  # OR using IBM packages"
        return 1
    fi
    
    # Show versions for debugging
    echo "Build tools detected:"
    echo "  Node.js: $(node --version)"
    echo "  npm: $(npm --version)"
    echo "  gcc: $(gcc --version 2>/dev/null | head -1 || echo 'not found')"
    echo "  xlc: $(xlc -qversion 2>/dev/null | head -1 || echo 'not found')"
    echo "  Python: $(python3 --version 2>/dev/null || python --version 2>/dev/null || echo 'not found')"
    
    return 0
}

# Check if a module needs patching
module_needs_patching() {
    local module_path="$1"
    local module_name="$2"
    
    # Check if module exists
    if [[ ! -d "$module_path" ]]; then
        echo "Module $module_name not found at $module_path"
        return 1  # Module doesn't exist
    fi
    
    # Check if already patched
    if [[ -f "$module_path/.aix-patched" ]]; then
        echo "Module $module_name already patched for AIX"
        return 1  # Already patched
    fi
    
    # Check for problematic .node files
    local node_files=$(find "$module_path" -name "*.node" -type f 2>/dev/null)
    if [[ -n "$node_files" ]]; then
        # Check if any .node files are Linux binaries
        for node_file in $node_files; do
            if file "$node_file" 2>/dev/null | grep -q "ELF.*x86-64"; then
                echo "Found Linux binary in $module_name: $node_file"
                return 0  # Needs patching
            fi
        done
    fi
    
    return 1  # Doesn't need patching
}

# Create backup of original module
backup_module() {
    local module_path="$1"
    local backup_suffix="${2:-linux-backup}"
    
    if [[ ! -d "$module_path.$backup_suffix" ]]; then
        cp -r "$module_path" "$module_path.$backup_suffix"
        echo "Backed up original module to $module_path.$backup_suffix"
    else
        echo "ℹ️  Backup already exists: $module_path.$backup_suffix"
    fi
}

# Mark module as patched
mark_module_patched() {
    local module_path="$1"
    local module_name="$2"
    
    cat > "$module_path/.aix-patched" << EOF
AIX Patch Applied
Module: $module_name
Date: $(date)
Platform: $(uname -s) $(uname -m)
Node.js: $(node --version)
Compiler: $(gcc --version 2>/dev/null | head -1 || xlc -qversion 2>/dev/null | head -1 || echo 'unknown')
EOF
    
    echo "Marked $module_name as AIX-patched"
}

# Clean up temporary build directories
cleanup_temp_dirs() {
    echo "Cleaning up temporary build directories..."
    rm -rf /tmp/aix-*-build-* 2>/dev/null || true
    rm -rf /tmp/.npm-aix 2>/dev/null || true
}

# Trap to ensure cleanup on exit
trap cleanup_temp_dirs EXIT
#! /bin/bash

if [ -z "$CONFIGURATION" ]; then
    CONFIGURATION=Release
fi

ARCH="$1"

failures=""
fail() {
    failures="${failures}${1}\n"
}

basic_cmake() {
    dir="$1"
    extra="$2"
    xcode="$3"

    OSX_ARGS=""
    SHARED_LIBS=""
    if [ "$(uname)" = "Darwin" ]; then
        OSX_ARGS="-DBUILD_FRAMEWORK=1 -DCMAKE_OSX_ARCHITECTURES=\"$ARCH\""
    else
        SHARED_LIBS="-DBUILD_SHARED_LIBS=ON"
    fi

    if [ "$INSTALL_PREFIX" != "default" ]; then
        INSTALL_PREFIX="-DCMAKE_INSTALL_PREFIX=$(pwd)"
    else
        INSTALL_PREFIX=""
    fi
    echo "calling cmake $dir"

    full_dir=$(dirname "${BASH_SOURCE[0]}")/$dir
    command="cmake $SHARED_LIBS $extra $OSX_ARGS -DINSTALL_MANPAGES=OFF $INSTALL_PREFIX -S $full_dir -B $full_dir/build"
    echo $command
    $command || (cat $full_dir/build/CMakeFiles/CMakeError.log && fail "cmake $full_dir")

    echo "building $dir"
    if [ -z "$xcode" ]; then
        (cd $full_dir/build && make) || fail "make $full_dir"
        (cd $full_dir/build && $SUDO make install) || fail "make install $full_dir"
    else
        (cd $full_dir/build && xcodebuild -arch "$ARCH" -configuration "$CONFIGURATION") || fail "xcodebuild $dir"
    fi
}

basic_cmake ogg
if [ "$(uname)" = "Darwin" ]; then
    cp -a Ogg.framework lib/
fi
# This is ridiculous, but SFML's findVorbis.cmake is trash so I also install ogg to system folders
# to the system folders
rm -rf ogg/build
SUDO=sudo INSTALL_PREFIX=default basic_cmake ogg

basic_cmake vorbis "-DBUILD_TESTING=0 -DOGG_ROOT=$(pwd)"
# This is ridiculous, but SFML's findVorbis.cmake is trash so I also install vorbis to system folders
# to the system folders
rm -rf vorbis/build
SUDO=sudo INSTALL_PREFIX=default basic_cmake vorbis "-DBUILD_TESTING=0 -DOGG_ROOT=$(pwd)"

if [ "$(uname)" = "Darwin" ]; then
    cp -a vorbis/build/lib/Vorbis.framework lib/
fi

basic_cmake flac "-DOGG_ROOT=$(pwd)"
# Again, ridiculous double build required
rm -rf flac/build
SUDO=sudo INSTALL_PREFIX=default basic_cmake flac "-DOGG_ROOT=$(pwd)"

flags=""
xcode=""
if [ "$(uname)" = "Darwin" ]; then
    flags="-GXcode -DCMAKE_GENERATOR=Xcode"
    xcode="true"
fi

basic_cmake freetype "$flags" "$xcode"

if [ "$(uname)" = "Darwin" ]; then
    cp -a freetype/build/$CONFIGURATION/freetype.framework lib/
fi

cp lib/cmake/* "$2/cmake/"

if [ -n "$failures" ]; then
    echo "Building SFML dependencies failed:\n${failures}"
fi
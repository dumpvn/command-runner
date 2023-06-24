# Change Log

All notable changes to the "command-runner" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.19] - 2023-06-24 10:04:52
### Added
- option to specify terminal name to be run

## [0.0.18] - 2022-11-15
### Added
- send raw text option

## [0.0.17] - 2022-04-11
### Added
- comment command / support -, *

## [0.0.16] - 2022-04-11
### Added
- comment command


## [0.0.15] - 2022-03-24
### Added
- lcmp and rcmp

## [0.0.14] - 2021-10-23
### Fixed
- Fixed case that there is one inactive terminal and causing creating another terminal

## [0.0.13] - 2021-10-22
### Added
- option to auto scroll to bottom after executing command


## [0.0.12] - 2021-10-21
### Added
- option to disable replace template
- delay between commands is configurable

## [0.0.11] - 2021-10-21
### Changed
- Added warning to readme.


## [0.0.10] - 2021-10-21
### Changed
- selected text won't be trimmed, user able to blank lines

### Fixed
- split lines using correct line ending sequence LF, CRLF

## [0.0.9] - 2021-10-20
### Added
- option to run block of code line by line

## [0.0.8] - 2021-10-18
### Added
- expand DOS env variable like %PATH%


## [0.0.7] - 2021-10-10
### Added
- chnage replace format from ${env:PATH} to ${{env:PATH}} to support bash variable like ${HOME}

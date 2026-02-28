# gpgparty

GPG keysigning party visualizer and helper

## What is this?

This tool was used during the "[GPG intro and keysigning session][gpg-session-url]" hosted at Hack Night, a Purdue Hackers event.

[gpg-session-url]: https://links.ericswpark.com/phackers-gpg-session

Participants could upload their public keys and view a list of participants and download their public keys. After signing the public key with GPG, they could then re-upload the public key. Each time a new connection is made, a web-of-trust graph is updated on the left of the screen. At the conclusion of the event, people could download all of the signed public keys and import them into GPG.

This tool was made with PartyKit for the multiplayer/room backend and data sharing, and OpenPGP.js for validating uploaded public keys.

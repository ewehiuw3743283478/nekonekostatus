package iperf3

import (
	"io"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/gorilla/websocket"
)

type Stat struct {
	Type     string
	Interval string
	Transfer uint64
	Bitrate  uint64
	Retr     uint64
}

type Result struct {
	Success bool
	Stats   []Stat
	Total   Stat
}

const iperf3path = "/usr/bin/iperf3"
const timeout = 5000

// toStat converts a string line to a Stat struct.
func toStat(line string) Stat {
	fields := strings.Fields(line[5:])
	log.Println(line, fields)

	transfer, _ := strconv.ParseFloat(fields[2], 10)
	var transferBytes uint64
	switch fields[3] {
	case "TBytes":
		transferBytes = uint64(transfer) * 1024 * 1024 * 1024 * 1024
	case "GBytes":
		transferBytes = uint64(transfer) * 1024 * 1024 * 1024
	case "MBytes":
		transferBytes = uint64(transfer) * 1024 * 1024
	case "KBytes":
		transferBytes = uint64(transfer) * 1024
	}

	bitrate, _ := strconv.Atoi(fields[4])
	stat := Stat{
		Interval: fields[0],
		Transfer: transferBytes,
		Bitrate:  uint64(bitrate),
	}

	// If there are more than 7 fields, assume there's a "Retr" value.
	if len(fields) > 7 {
		retr, _ := strconv.Atoi(fields[6])
		stat.Retr = uint64(retr)
	}

	return stat
}

// AnalStdout processes the output from iperf3, sends stats via WebSocket, and returns the final Result.
func AnalStdout(stdout io.Reader, multi bool, ws *websocket.Conn) (res Result) {
	waitID := true
	buf := make([]byte, 2048)

	for {
		n, err := stdout.Read(buf)
		if err != nil {
			if err != io.EOF {
				log.Println("Error reading stdout:", err)
			}
			break
		}

		output := string(buf[:n])
		for _, line := range strings.Split(output, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}

			if waitID {
				if strings.HasPrefix(line, "[ ID]") {
					waitID = false
				}
				continue
			}

			if line[0] != '[' || (multi && line[1] != 'S') {
				continue
			}

			if strings.HasSuffix(line, "Mbits/sec") {
				stat := toStat(line)
				stat.Type = "interval"
				res.Stats = append(res.Stats, stat)
				if ws != nil {
					ws.WriteJSON(stat)
				}
			}

			if strings.HasSuffix(line, "sender") {
				stat := toStat(line)
				stat.Type = "total"
				res.Total = stat
			}
		}
	}

	res.Success = true
	if ws != nil {
		ws.WriteJSON(res)
		ws.Close()
	}
	return res
}

// Iperf3 runs an iperf3 command with the specified parameters and returns the result.
func Iperf3(host string, port int, reverse bool, ti int, parallel int, protocol string, ws *websocket.Conn) (res Result, err error) {
	args := []string{
		"-c", host,
		"-p", strconv.Itoa(port),
		"-P", strconv.Itoa(parallel),
		"-t", strconv.Itoa(ti),
		"--connect-timeout", strconv.Itoa(timeout),
		"--rcv-timeout", strconv.Itoa(timeout),
		"--forceflush",
		"-f", "mbps",
	}

	if reverse {
		args = append(args, "-R")
	}
	if protocol == "udp" {
		args = append(args, "-u")
	}

	cmd := exec.Command(iperf3path, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Println("Error creating stdout pipe:", err)
		return res, err
	}

	if err := cmd.Start(); err != nil {
		log.Println("Error starting iperf3 command:", err)
		return res, err
	}

	res = AnalStdout(stdout, parallel > 1, ws)

	if err := cmd.Wait(); err != nil {
		log.Println("Error waiting for iperf3 command to finish:", err)
		return res, err
	}

	return res, nil
}

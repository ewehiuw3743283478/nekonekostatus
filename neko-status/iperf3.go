package main

import (
	"log"
	"net/http"
	"neko-status/iperf3"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	defaultPort     = 5201
	defaultTime     = 10
	defaultParallel = 1
	defaultProtocol = "tcp"
)

var upGrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func Iperf3(c *gin.Context) {
	host := c.PostForm("host")
	port, err := strconv.Atoi(c.PostForm("port"))
	if err != nil || port == 0 {
		port = defaultPort
	}
	reverse := c.PostForm("reverse") != ""
	time, err := strconv.Atoi(c.PostForm("time"))
	if err != nil || time == 0 {
		time = defaultTime
	}
	parallel, err := strconv.Atoi(c.PostForm("parallel"))
	if err != nil || parallel == 0 {
		parallel = defaultParallel
	}
	protocol := c.PostForm("protocol")
	if protocol == "" {
		protocol = defaultProtocol
	}

	res, err := iperf3.Iperf3(host, port, reverse, time, parallel, protocol, nil)
	if err == nil {
		resp(c, true, res, http.StatusOK)
	} else {
		resp(c, false, err.Error(), http.StatusInternalServerError)
	}
}

func Iperf3Ws(c *gin.Context) {
	host := c.Query("host")
	port, err := strconv.Atoi(c.Query("port"))
	if err != nil || port == 0 {
		port = defaultPort
	}
	reverse := c.Query("reverse") != ""
	time, err := strconv.Atoi(c.Query("time"))
	if err != nil || time == 0 {
		time = defaultTime
	}
	parallel, err := strconv.Atoi(c.Query("parallel"))
	if err != nil || parallel == 0 {
		parallel = defaultParallel
	}
	protocol := c.Query("protocol")
	if protocol == "" {
		protocol = defaultProtocol
	}

	ws, err := upGrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer ws.Close()

	err = iperf3.Iperf3(host, port, reverse, time, parallel, protocol, ws)
	if err != nil {
		log.Println("iperf3 error:", err)
	}
}

func resp(c *gin.Context, success bool, data interface{}, statusCode int) {
	c.JSON(statusCode, gin.H{
		"success": success,
		"data":    data,
	})
}

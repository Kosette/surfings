#!/bin/sh
proxy_port=7892
fake_ip=198.18.0.0/16
ssh_port=22

# bypass ssh 22 port 
iptables -t nat -A PREROUTING -p tcp --dport $ssh_port -j ACCEPT

# create clash filters and bypass private ips
iptables -t nat -N CLASH
iptables -t nat -A CLASH -d 192.168.0.0/16 -j RETURN
iptables -t nat -A CLASH -d 10.0.0.0/8 -j RETURN
iptables -t nat -A CLASH -d 127.0.0.0/8 -j RETURN
iptables -t nat -A CLASH -d 169.254.0.0/16 -j RETURN
iptables -t nat -A CLASH -d 172.16.0.0/12 -j RETURN
iptables -t nat -A CLASH -d 224.0.0.0/4 -j RETURN
iptables -t nat -A CLASH -d 240.0.0.0/4 -j RETURN

# redirect to Clash
iptables -t nat -A PREROUTING -j CLASH
iptables -t nat -A CLASH -p tcp -j REDIRECT --to-ports $proxy_port

# fake-ip rules
iptables -t nat -A OUTPUT -p tcp -d $fake_ip -j REDIRECT --to-ports $proxy_port

# DNS
iptables -t nat -A PREROUTING -p udp -m udp --dport 53 -j DNAT --to-destination $lan_ip:65

# udp
modprobe xt_TPROXY
proxy_fwmark="0x162"
proxy_table="0x162"
ip rule add fwmark $proxy_fwmark table $proxy_table
ip route add local default dev lo table $proxy_table

# create new clash filters
iptables -t mangle -N CLASH
iptables -t mangle -A CLASH -d 192.168.0.0/16 -j RETURN
iptables -t mangle -A CLASH -d 10.0.0.0/8 -j RETURN
iptables -t mangle -A CLASH -d 127.0.0.0/8 -j RETURN
iptables -t mangle -A CLASH -d 169.254.0.0/16 -j RETURN
iptables -t mangle -A CLASH -d 172.16.0.0/12 -j RETURN
iptables -t mangle -A CLASH -d 224.0.0.0/4 -j RETURN
iptables -t mangle -A CLASH -d 240.0.0.0/4 -j RETURN

# redirect to Clash
iptables -t mangle -A CLASH -p udp -j TPROXY --on-port $proxy_port --tproxy-mark $proxy_table
iptables -t mangle -A PREROUTING -p udp -j CLASH

# fake-ip rules
iptables -t mangle -A OUTPUT -p udp -d $fake_ip -j MARK --set-mark $proxy_fwmark

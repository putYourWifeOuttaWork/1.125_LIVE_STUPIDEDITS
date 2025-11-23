# Protocol Comparison: Documentation vs Implementation

## MQTT Topics

### Per Documentation:
1. `device/{id}/status` - Device HELLO (alive) messages
2. `device/{id}/cmd` - Server commands to device
3. `device/{id}/data` - Device payload chunks (metadata & chunks)
4. `device/{id}/ack` - Device ACKs and server responses

### Per Our Implementation:
Let me check our actual topics...

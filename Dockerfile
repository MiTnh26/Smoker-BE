FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 9999

CMD ["node", "server.js"]
# hoặc CMD ["npm", "start"] nếu bạn dùng script start
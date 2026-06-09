// script.js

const BACKEND_URL = "http://77.237.240.245:8128"; // URL do seu backend

async function fetchMarketData() {
    try {
        const response = await fetch(`${BACKEND_URL}/market_data`); // Endpoint de exemplo
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Dados do mercado recebidos:", data);
        // Aqui você adicionaria a lógica para atualizar o DOM com os dados
    } catch (error) {
        console.error("Erro ao buscar dados do mercado:", error);
    }
}

function sendPrompt(promptText) {
    console.log("Frontend enviou prompt para Rony (via API):", promptText);
    fetch(`${BACKEND_URL}/api/hermes/command`, { // Endpoint de exemplo para prompts
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: promptText }),
    })
    .then(response => response.json())
    .then(data => {
        console.log("Resposta do prompt recebida:", data);
        // Lógica para lidar com a resposta do prompt
    })
    .catch((error) => {
        console.error('Erro ao enviar prompt:', error);
    });
}

// Chamar a função para buscar dados quando a página carregar
document.addEventListener('DOMContentLoaded', fetchMarketData);

// Adicionar um timer para atualizar os dados a cada 30 segundos (exemplo)
// setInterval(fetchMarketData, 30000);
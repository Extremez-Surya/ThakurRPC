import { log } from '../../utils/functions.js';
import axios from 'axios'; 

export default {
    name: 'fox',
    description: 'Get a random fox picture.',
    aliases: ['foxpic'],
    usage: '',
    category: 'general',
    type: 'both',
    permissions: ['SendMessages', 'AttachFiles'], 
    cooldown: 5,

    execute: async (client, message, args) => {
        try {
            const response = await axios.get('https://randomfox.ca/floof/', {
                timeout: 10000,
            });
            if (response.status !== 200) throw new Error('Failed to fetch fox image.');

            const imageUrl = response.data.image || response.data.file;

            if (!imageUrl) {
                throw new Error('Fox image URL was missing from the API response.');
            }

            return message.channel.send(imageUrl);
        } catch (error) {
            log(`Error fetching fox image: ${error.message}`, 'error');
            message.channel.send(`> ❌ Failed to get fox picture: ${error.message}`); // Improved error message
        }
    }
};